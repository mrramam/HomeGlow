import React, { useCallback, useMemo, useState } from 'react';
import { Box, Typography, IconButton, LinearProgress, Chip } from '@mui/material';
import { Check, RadioButtonUnchecked } from '@mui/icons-material';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';

// Shared list-view component for a routine: an ordered checklist with a tick
// per step. Used by the RoutineWidget and by any surface that opens a routine
// from the calendar strip, so a routine reads the same everywhere.
//
// Trust `recorded_completion` from the progress endpoint over the ticked-step
// count — a routine that finished stays done even if a step is later unticked,
// so a wall display can't flicker in and out of its finished state. The
// individual step tick still reflects `ticked_step_ids` so the child sees what
// they actually did; only the routine-level "done" chrome is sticky.

const RoutineChecklist = ({
  routine,
  progress,
  onProgressChange,
  onRoutineCompleted,
  disabled = false,
}) => {
  const { t } = useTranslation(['routines', 'common']);
  const [pendingStepId, setPendingStepId] = useState(null);
  const [error, setError] = useState(null);

  const tickedSet = useMemo(() => {
    const ids = progress?.ticked_step_ids;
    return new Set(Array.isArray(ids) ? ids : []);
  }, [progress]);

  const recordedComplete = !!progress?.recorded_completion;
  const totalSteps = progress?.total_steps ?? routine?.steps?.length ?? 0;
  const doneSteps = progress?.done_steps ?? tickedSet.size;
  const percent = totalSteps > 0 ? Math.min(100, Math.round((doneSteps / totalSteps) * 100)) : 0;

  const toggleStep = useCallback(async (step) => {
    if (disabled || pendingStepId != null) return;
    const wasTicked = tickedSet.has(step.id);
    const wasRecordedComplete = recordedComplete;
    setPendingStepId(step.id);
    setError(null);
    try {
      const url = `${API_BASE_URL}/api/routines/${routine.id}/steps/${step.id}/tick`;
      if (wasTicked) {
        await axios.delete(url);
      } else {
        await axios.post(url);
      }
      // Re-fetch progress rather than mutate locally: the server is the
      // authority on recorded_completion, streak, and any concurrent taps
      // from another display.
      const { data } = await axios.get(`${API_BASE_URL}/api/routines/${routine.id}/progress`);
      if (onProgressChange) onProgressChange(data);
      if (!wasRecordedComplete && data?.recorded_completion && onRoutineCompleted) {
        onRoutineCompleted(data);
      }
    } catch (err) {
      const message = err?.response?.data?.error || t('routines:checklist.tickFailed');
      setError(message);
    } finally {
      setPendingStepId(null);
    }
  }, [disabled, pendingStepId, tickedSet, recordedComplete, routine?.id, onProgressChange, onRoutineCompleted, t]);

  const steps = Array.isArray(routine?.steps) ? routine.steps : [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', flex: 1 }}>
          {routine?.icon ? `${routine.icon} ` : ''}{routine?.name || routine?.summary || ''}
        </Typography>
        {recordedComplete && (
          <Chip
            label={t('routines:checklist.doneToday')}
            color="success"
            size="small"
            aria-label={t('routines:checklist.doneToday')}
          />
        )}
      </Box>

      {totalSteps > 0 && (
        <Box>
          <LinearProgress
            variant="determinate"
            value={percent}
            aria-label={t('routines:checklist.progressAria', { done: doneSteps, total: totalSteps })}
            sx={{
              height: 6,
              borderRadius: 3,
              backgroundColor: 'rgba(var(--accent-rgb), 0.15)',
              '& .MuiLinearProgress-bar': { backgroundColor: 'var(--accent)' },
            }}
          />
          <Typography
            variant="caption"
            sx={{ color: 'var(--text-color)', opacity: 0.7, display: 'block', mt: 0.5 }}
          >
            {t('routines:checklist.progressLabel', { done: doneSteps, total: totalSteps })}
          </Typography>
        </Box>
      )}

      {error && (
        <Typography variant="caption" color="error" role="alert">
          {error}
        </Typography>
      )}

      {steps.length === 0 ? (
        <Typography
          variant="body2"
          sx={{ color: 'var(--text-color)', opacity: 0.7, textAlign: 'center', py: 1 }}
        >
          {t('routines:checklist.noSteps')}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {steps.map((step, index) => {
            const ticked = tickedSet.has(step.id);
            const isPending = pendingStepId === step.id;
            const label = step.title || step.name || step.summary || '';
            return (
              <Box
                key={step.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1,
                  minHeight: 44,
                  border: '1px solid var(--card-border)',
                  borderRadius: 2,
                  backgroundColor: ticked ? 'rgba(0, 200, 83, 0.08)' : 'transparent',
                  cursor: disabled ? 'default' : 'pointer',
                }}
                onClick={() => toggleStep(step)}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-pressed={ticked}
                aria-label={ticked
                  ? t('routines:checklist.untickAria', { title: label })
                  : t('routines:checklist.tickAria', { title: label })}
                onKeyDown={(event) => {
                  if (disabled) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleStep(step);
                  }
                }}
              >
                <IconButton
                  size="small"
                  disabled={disabled || isPending}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleStep(step);
                  }}
                  sx={{
                    width: 40,
                    height: 40,
                    color: ticked ? 'white' : 'var(--accent)',
                    backgroundColor: ticked ? 'var(--accent)' : 'transparent',
                    border: ticked ? 'none' : '2px solid var(--accent)',
                    '&:hover': {
                      backgroundColor: ticked ? 'var(--accent)' : 'rgba(var(--accent-rgb), 0.1)',
                      filter: 'brightness(1.1)',
                    },
                  }}
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  {ticked ? <Check fontSize="small" /> : <RadioButtonUnchecked fontSize="small" />}
                </IconButton>
                <Typography
                  variant="body1"
                  sx={{
                    flex: 1,
                    color: 'var(--text-color)',
                    textDecoration: ticked ? 'line-through' : 'none',
                    fontWeight: ticked ? 400 : 500,
                  }}
                >
                  <Box component="span" sx={{ opacity: 0.6, mr: 0.5 }}>{index + 1}.</Box>
                  {step.icon ? <Box component="span" sx={{ mr: 0.5 }}>{step.icon}</Box> : null}
                  {label}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default RoutineChecklist;
