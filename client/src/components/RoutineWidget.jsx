import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getTodayDateString } from '../utils/choreHelpers.js';
import {
  occurrencesForDate,
  remainingRoutines,
  routineDayStatus,
} from '../utils/routineHelpers.js';
import { acquireCelebration, releaseCelebration } from '../utils/celebrationLock.js';
import RoutineChecklist from './RoutineChecklist.jsx';
import ChoreCelebration from './ChoreCelebration.jsx';
import PrizeCelebration from './PrizeCelebration.jsx';

// A streak count is a milestone when the server has actually paid clams for
// it. The server owns the schedule; the client only mirrors it here to know
// when to fire the louder (prize) celebration instead of the smaller (chore)
// one. Kept in one place so the list is easy to update alongside the server.
const STREAK_MILESTONES = new Set([3, 7, 14, 21, 30, 60, 90, 180, 365]);

const parseTabConfigJson = (configJson) => {
  if (!configJson) return {};
  if (typeof configJson === 'object' && !Array.isArray(configJson)) return configJson;
  if (typeof configJson !== 'string') return {};
  try {
    const parsed = JSON.parse(configJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const readBoundUserIdFromTabConfig = (configJson) => {
  const layout = parseTabConfigJson(configJson);
  const entry = layout.routines;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const raw = entry.userId ?? entry.user_id;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const RoutineWidget = ({
  refreshNonce = 0,
  activeTab = 1,
  activeTabConfigJson = null,
}) => {
  const { t } = useTranslation(['routines', 'common']);
  const [users, setUsers] = useState([]);
  const [routines, setRoutines] = useState([]);
  const [progressById, setProgressById] = useState({});
  const [occurrences, setOccurrences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openRoutineId, setOpenRoutineId] = useState(null);
  const [showChoreConfetti, setShowChoreConfetti] = useState(false);
  const [showPrizeCelebration, setShowPrizeCelebration] = useState(null);
  // Read on the fly rather than on mount: "today" on a wall display has to
  // survive being computed once and left alone across midnight.
  const today = getTodayDateString();
  const boundUserId = readBoundUserIdFromTabConfig(activeTabConfigJson);
  const boundUser = useMemo(
    () => users.find((u) => u.id === boundUserId) || null,
    [users, boundUserId],
  );

  const fetchAll = useCallback(async () => {
    if (!boundUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [routinesResponse, occurrencesResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/routines`, {
          params: { user_id: boundUserId, visible: 1 },
        }),
        axios.get(`${API_BASE_URL}/api/routine-occurrences`, {
          params: { start: today, end: today, user_id: boundUserId },
        }),
      ]);

      const nextRoutines = Array.isArray(routinesResponse.data) ? routinesResponse.data : [];
      const nextOccurrences = Array.isArray(occurrencesResponse.data) ? occurrencesResponse.data : [];
      setRoutines(nextRoutines);
      setOccurrences(nextOccurrences);

      const todaysOccurrences = occurrencesForDate(nextOccurrences, today);
      const uniqueRoutineIds = Array.from(new Set(todaysOccurrences.map((o) => o.routine_id))).filter(Boolean);
      const progressEntries = await Promise.all(uniqueRoutineIds.map(async (routineId) => {
        try {
          const { data } = await axios.get(
            `${API_BASE_URL}/api/routines/${routineId}/progress`,
            { params: { date: today } },
          );
          return [routineId, data];
        } catch {
          return [routineId, null];
        }
      }));
      const nextProgress = {};
      progressEntries.forEach(([routineId, data]) => {
        if (data) nextProgress[routineId] = data;
      });
      setProgressById(nextProgress);
    } catch (err) {
      console.error('Error loading routines:', err);
      setError(t('routines:widget.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [boundUserId, today, t]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/users`);
        setUsers(Array.isArray(response.data) ? response.data.filter((u) => u.id !== 0) : []);
      } catch (err) {
        console.error('Error fetching users:', err);
      }
    };
    void fetchUsers();
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const lastRefreshNonceRef = useRef(refreshNonce);
  useEffect(() => {
    if (refreshNonce === lastRefreshNonceRef.current) return;
    lastRefreshNonceRef.current = refreshNonce;
    void fetchAll();
  }, [refreshNonce, fetchAll]);

  // Tracks which celebration kind (if any) this component currently holds.
  // Only release on unmount when the ref confirms we are the holder — a bare
  // unconditional release would clear another widget's live overlay.
  const holdingKindRef = useRef(null);
  useEffect(() => {
    return () => {
      if (holdingKindRef.current) {
        releaseCelebration(holdingKindRef.current);
        holdingKindRef.current = null;
      }
    };
  }, []);

  const todaysOccurrences = useMemo(
    () => occurrencesForDate(occurrences, today),
    [occurrences, today],
  );

  const remaining = useMemo(
    () => remainingRoutines(todaysOccurrences, progressById),
    [todaysOccurrences, progressById],
  );

  const status = useMemo(
    () => routineDayStatus(todaysOccurrences, progressById),
    [todaysOccurrences, progressById],
  );

  const openRoutine = useMemo(() => {
    if (openRoutineId == null) return null;
    return routines.find((r) => r.id === openRoutineId) || null;
  }, [openRoutineId, routines]);

  const openOccurrence = useMemo(() => {
    if (openRoutineId == null) return null;
    return todaysOccurrences.find((o) => o.routine_id === openRoutineId) || null;
  }, [openRoutineId, todaysOccurrences]);

  const handleProgressChange = useCallback((routineId, nextProgress) => {
    setProgressById((prev) => ({ ...prev, [routineId]: nextProgress }));
  }, []);

  const handleRoutineCompleted = useCallback((nextProgress) => {
    const streak = Number.isFinite(nextProgress?.current_streak) ? nextProgress.current_streak : 0;
    const isMilestone = STREAK_MILESTONES.has(streak);

    if (isMilestone) {
      if (acquireCelebration('prize')) {
        holdingKindRef.current = 'prize';
        setShowPrizeCelebration({
          username: boundUser?.username || '',
          streak,
        });
      }
      // Milestone hit — the louder prize overlay stands in for the smaller
      // chore confetti, so we do not also fire the wordless burst.
      return;
    }

    if (acquireCelebration('chore')) {
      holdingKindRef.current = 'chore';
      setShowChoreConfetti(true);
    }
  }, [boundUser]);

  const dismissChoreConfetti = useCallback(() => {
    setShowChoreConfetti(false);
    holdingKindRef.current = null;
    releaseCelebration('chore');
  }, []);

  const dismissPrizeCelebration = useCallback(() => {
    setShowPrizeCelebration(null);
    holdingKindRef.current = null;
    releaseCelebration('prize');
  }, []);

  const renderEmptyState = () => {
    if (!boundUserId) {
      return (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography variant="body1" sx={{ color: 'var(--text-color)', mb: 1 }}>
            {t('routines:widget.notBound')}
          </Typography>
          <Typography variant="caption" sx={{ color: 'var(--text-color)', opacity: 0.7 }}>
            {t('routines:widget.notBoundHint')}
          </Typography>
        </Box>
      );
    }

    if (status === 'nothing-due') {
      // Calm, quiet — deliberately different from "all-done" so the child who
      // did nothing gets a different acknowledgement than the child who
      // finished everything.
      return (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography sx={{ fontSize: '2rem', lineHeight: 1, mb: 0.5 }} aria-hidden="true">🌤️</Typography>
          <Typography variant="body1" sx={{ color: 'var(--text-color)' }}>
            {t('routines:widget.nothingDue', { name: boundUser?.username || '' })}
          </Typography>
          <Typography variant="caption" sx={{ color: 'var(--text-color)', opacity: 0.7 }}>
            {t('routines:widget.nothingDueHint')}
          </Typography>
        </Box>
      );
    }

    if (status === 'all-done') {
      return (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography sx={{ fontSize: '2.5rem', lineHeight: 1, mb: 0.5 }} aria-hidden="true">🎉</Typography>
          <Typography variant="h6" sx={{ color: 'var(--accent)', fontWeight: 'bold' }}>
            {t('routines:widget.allDoneHeading', { name: boundUser?.username || '' })}
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text-color)', opacity: 0.8 }}>
            {t('routines:widget.allDoneSubtitle')}
          </Typography>
        </Box>
      );
    }

    return null;
  };

  return (
    <>
      <Box sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        p: 2,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Typography variant="h6" sx={{ flex: 1 }}>
            {boundUser
              ? t('routines:widget.titleFor', { name: boundUser.username })
              : t('routines:widget.title')}
          </Typography>
          {status === 'remaining' && (
            <Chip
              label={t('routines:widget.remainingChip', { count: remaining.length })}
              size="small"
              sx={{ bgcolor: 'var(--accent)', color: 'white', fontWeight: 'bold' }}
            />
          )}
        </Box>

        {loading && (
          <Typography variant="body2" sx={{ textAlign: 'center', py: 2, color: 'var(--text-color)', opacity: 0.7 }}>
            {t('common:state.loading')}
          </Typography>
        )}

        {!loading && error && (
          <Typography variant="body2" color="error" sx={{ textAlign: 'center', py: 2 }}>
            {error}
          </Typography>
        )}

        {!loading && !error && (status === 'remaining' ? (
          <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {remaining.map((occurrence) => {
              const routine = routines.find((r) => r.id === occurrence.routine_id);
              const progress = progressById[occurrence.routine_id];
              const done = progress?.done_steps ?? 0;
              const total = progress?.total_steps ?? routine?.steps?.length ?? 0;
              return (
                <Box
                  key={`${occurrence.routine_id}-${occurrence.date}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenRoutineId(occurrence.routine_id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setOpenRoutineId(occurrence.routine_id);
                    }
                  }}
                  aria-label={t('routines:widget.openRoutineAria', { title: occurrence.summary })}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    minHeight: 44,
                    p: 1.25,
                    border: '1px solid var(--card-border)',
                    borderRadius: 2,
                    cursor: 'pointer',
                    '&:hover': { backgroundColor: 'rgba(var(--accent-rgb), 0.06)' },
                  }}
                >
                  {occurrence.icon && (
                    <Box component="span" aria-hidden="true" sx={{ fontSize: '1.3rem' }}>
                      {occurrence.icon}
                    </Box>
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 'bold', color: 'var(--text-color)', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {occurrence.summary}
                    </Typography>
                    {total > 0 && (
                      <Typography variant="caption" sx={{ color: 'var(--text-color)', opacity: 0.7 }}>
                        {t('routines:widget.stepsProgress', { done, total })}
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        ) : renderEmptyState())}
      </Box>

      <Dialog
        open={openRoutineId != null}
        onClose={() => setOpenRoutineId(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ pr: 6 }}>
          {openRoutine?.name || openOccurrence?.summary || t('routines:widget.title')}
          <IconButton
            aria-label={t('common:actions.close')}
            onClick={() => setOpenRoutineId(null)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {openRoutine ? (
            <RoutineChecklist
              routine={openRoutine}
              progress={progressById[openRoutine.id]}
              onProgressChange={(nextProgress) => handleProgressChange(openRoutine.id, nextProgress)}
              onRoutineCompleted={handleRoutineCompleted}
            />
          ) : (
            <Typography variant="body2" color="text.secondary">
              {t('routines:widget.notFound')}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenRoutineId(null)} variant="contained">
            {t('common:actions.close')}
          </Button>
        </DialogActions>
      </Dialog>

      {showChoreConfetti && (
        <ChoreCelebration onDismiss={dismissChoreConfetti} />
      )}

      {showPrizeCelebration && (
        <PrizeCelebration
          username={showPrizeCelebration.username}
          prizeName={t('routines:celebration.streakMilestone', { count: showPrizeCelebration.streak })}
          onDismiss={dismissPrizeCelebration}
        />
      )}
    </>
  );
};

export default RoutineWidget;
