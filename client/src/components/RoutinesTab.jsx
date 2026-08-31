import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Tooltip,
  Divider,
  CircularProgress,
  Autocomplete,
  List,
  ListItem,
  ListItemText,
  Stack,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Save,
  Cancel,
  Refresh,
  Warning,
  KeyboardArrowUp,
  KeyboardArrowDown,
} from '@mui/icons-material';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getWeekdayLabels } from '../utils/dateUtils.js';
import { stackableTableSx } from '../utils/responsiveTable.js';
import useIsMobile from '../hooks/useIsMobile.js';
import ChoreIconPicker from './ChoreIconPicker.jsx';
import { ROUTINE_TEMPLATES, buildRoutineFromTemplate } from '../utils/routineTemplates.js';

// Crontab is minute hour dom month dow. Routines only care which days of the
// week the checklist appears — the server treats the crontab as the "opens
// at midnight" trigger and start_time/end_time are separate fields.
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];

const daysToCrontab = (days) => {
  if (!days || days.length === 0) return '';
  const sorted = [...days].sort((a, b) => a - b);
  return `0 0 * * ${sorted.join(',')}`;
};

// Accepts the "0 0 * * 1,2,3" shape this editor produces and any equivalent
// the server might round-trip; returns [] for anything unrecognised so the
// user is prompted to pick days again rather than silently losing data.
const parseCrontabDays = (crontab) => {
  if (typeof crontab !== 'string') return [];
  const trimmed = crontab.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) return [];
  const dowField = parts[4];
  if (dowField === '*') return [...ALL_DAYS];
  if (/^[\d,]+$/.test(dowField)) {
    return dowField
      .split(',')
      .map((n) => Number.parseInt(n, 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  }
  const rangeMatch = dowField.match(/^(\d)-(\d)$/);
  if (rangeMatch) {
    const [a, b] = [Number(rangeMatch[1]), Number(rangeMatch[2])];
    const out = [];
    for (let i = a; i <= b; i += 1) out.push(i);
    return out;
  }
  return [];
};

const defaultRoutineForm = () => ({
  name: '',
  icon: '',
  user_id: '',
  selectedDays: [...ALL_DAYS],
  start_time: '',
  end_time: '',
  streak_bonus_every: '',
  streak_bonus_clams: '',
  visible: true,
});

export default function RoutinesTab({ saveMessage, setSaveMessage }) {
  const { t } = useTranslation(['routines', 'chores', 'common']);
  const isMobile = useIsMobile();

  const [routines, setRoutines] = useState([]);
  const [users, setUsers] = useState([]);
  const [taskTitles, setTaskTitles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState(null);
  const [form, setForm] = useState(defaultRoutineForm());
  const [pendingSteps, setPendingSteps] = useState([]);
  const [newStepValue, setNewStepValue] = useState('');
  const [savingRoutine, setSavingRoutine] = useState(false);

  const [stepEditor, setStepEditor] = useState({ open: false, step: null, title: '' });
  const [savingStep, setSavingStep] = useState(false);

  const [deleteDialog, setDeleteDialog] = useState({ open: false, routine: null });

  const weekdayLabels = useMemo(() => getWeekdayLabels(0), []);

  const showMessage = useCallback((type, text) => {
    if (!setSaveMessage) return;
    setSaveMessage({ show: true, type, text });
    setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3500);
  }, [setSaveMessage]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [routinesRes, usersRes, titlesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/routines`),
        axios.get(`${API_BASE_URL}/api/users`),
        axios.get(`${API_BASE_URL}/api/task-titles`),
      ]);
      setRoutines(Array.isArray(routinesRes.data) ? routinesRes.data : []);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data.filter((u) => u.id !== 0) : []);
      setTaskTitles(Array.isArray(titlesRes.data) ? titlesRes.data : []);
    } catch (err) {
      console.error('Error loading routines:', err);
      setLoadError(t('routines:messages.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // How many other routines share a given step id. Powers the "editing a step
  // changes it everywhere" warning without another round-trip.
  const stepUsageCount = useCallback((stepId) => {
    if (stepId === undefined || stepId === null) return 0;
    let count = 0;
    for (const routine of routines) {
      const steps = Array.isArray(routine.steps) ? routine.steps : [];
      if (steps.some((s) => s.id === stepId)) count += 1;
    }
    return count;
  }, [routines]);

  const openCreate = () => {
    setEditingRoutine(null);
    setForm(defaultRoutineForm());
    setPendingSteps([]);
    setNewStepValue('');
    setEditorOpen(true);
  };

  const openEdit = (routine) => {
    setEditingRoutine(routine);
    const selectedDays = parseCrontabDays(routine.crontab);
    setForm({
      name: routine.name || '',
      icon: routine.icon || '',
      user_id: routine.user_id ?? '',
      selectedDays: selectedDays.length ? selectedDays : [...ALL_DAYS],
      start_time: routine.start_time || '',
      end_time: routine.end_time || '',
      streak_bonus_every: routine.streak_bonus_every ? String(routine.streak_bonus_every) : '',
      streak_bonus_clams: routine.streak_bonus_clams ? String(routine.streak_bonus_clams) : '',
      visible: routine.visible === undefined ? true : !!routine.visible,
    });
    // Steps carry an id when they came from the server. The editor treats
    // server-backed steps and locally-added ones the same in the list, and
    // decides which endpoint to call at save time.
    setPendingSteps(
      (Array.isArray(routine.steps) ? routine.steps : []).map((s) => ({
        step_id: s.id,
        title: s.title,
        icon: s.icon || '',
        isNew: false,
      })),
    );
    setNewStepValue('');
    setEditorOpen(true);
  };

  const applyTemplate = (template) => {
    const seed = buildRoutineFromTemplate(template, t);
    if (!seed) return;
    setEditingRoutine(null);
    setForm({
      ...defaultRoutineForm(),
      name: seed.name,
      icon: seed.icon,
    });
    setPendingSteps(seed.steps.map((s) => ({
      step_id: null,
      title: s.title,
      icon: s.icon,
      isNew: true,
    })));
    setNewStepValue('');
    setEditorOpen(true);
    showMessage('info', t('routines:messages.templateApplied'));
  };

  const addStepFromInput = () => {
    const raw = typeof newStepValue === 'string' ? newStepValue.trim() : '';
    if (!raw) return;
    // Autocomplete may hand back an option object (an existing library step)
    // or a free-typed string. A picked existing step attaches by step_id at
    // save time; a typed one is created inline.
    let title = raw;
    let icon = '';
    let step_id = null;
    if (typeof newStepValue === 'object' && newStepValue !== null) {
      title = newStepValue.title || raw;
      icon = newStepValue.icon || '';
      if (newStepValue.source === 'step' && newStepValue.id) {
        step_id = newStepValue.id;
      }
    }
    setPendingSteps((prev) => [...prev, { step_id, title, icon, isNew: !step_id }]);
    setNewStepValue('');
  };

  const moveStep = (index, delta) => {
    setPendingSteps((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeStepAt = (index) => {
    setPendingSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const openStepEditor = (step) => {
    if (!step || step.isNew || !step.step_id) return;
    setStepEditor({ open: true, step, title: step.title });
  };

  const handleStepSave = async () => {
    const title = (stepEditor.title || '').trim();
    if (!title || !stepEditor.step?.step_id) return;
    setSavingStep(true);
    try {
      await axios.patch(`${API_BASE_URL}/api/steps/${stepEditor.step.step_id}`, { title });
      showMessage('success', t('routines:messages.stepUpdated'));
      setPendingSteps((prev) => prev.map((s) => (
        s.step_id === stepEditor.step.step_id ? { ...s, title } : s
      )));
      setStepEditor({ open: false, step: null, title: '' });
      await fetchAll();
    } catch (err) {
      showMessage('error', err.response?.data?.error || t('routines:messages.saveFailed'));
    } finally {
      setSavingStep(false);
    }
  };

  const handleSaveRoutine = async () => {
    if (!form.name.trim()) return;
    if (form.selectedDays.length === 0) return;

    setSavingRoutine(true);
    try {
      const payload = {
        name: form.name.trim(),
        icon: form.icon || null,
        user_id: form.user_id === '' ? null : form.user_id,
        crontab: daysToCrontab(form.selectedDays),
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        streak_bonus_every: form.streak_bonus_every
          ? Number.parseInt(form.streak_bonus_every, 10) || null
          : null,
        streak_bonus_clams: form.streak_bonus_clams
          ? Number.parseInt(form.streak_bonus_clams, 10) || null
          : null,
        visible: form.visible ? 1 : 0,
      };

      let routineId;
      if (editingRoutine) {
        await axios.patch(`${API_BASE_URL}/api/routines/${editingRoutine.id}`, payload);
        routineId = editingRoutine.id;
      } else {
        const res = await axios.post(`${API_BASE_URL}/api/routines`, payload);
        routineId = res.data?.id;
        if (!routineId) throw new Error('Server did not return a routine id');
      }

      const originalStepIds = editingRoutine
        ? (Array.isArray(editingRoutine.steps) ? editingRoutine.steps : [])
          .map((s) => s.id).filter((id) => id !== undefined && id !== null)
        : [];
      const keptStepIds = pendingSteps
        .map((s) => s.step_id)
        .filter((id) => id !== undefined && id !== null);
      const removed = originalStepIds.filter((id) => !keptStepIds.includes(id));

      for (const stepId of removed) {
        await axios.delete(`${API_BASE_URL}/api/routines/${routineId}/steps/${stepId}`);
      }

      // Attach or create each pending step. Newly-created steps come back
      // with an id we splice in so the reorder call at the end can list
      // every current step exactly once, as the API requires.
      const finalStepIds = new Array(pendingSteps.length);
      for (let i = 0; i < pendingSteps.length; i += 1) {
        const step = pendingSteps[i];
        if (step.step_id && originalStepIds.includes(step.step_id)) {
          finalStepIds[i] = step.step_id;
          continue;
        }
        const body = step.step_id
          ? { step_id: step.step_id }
          : { title: step.title, icon: step.icon || null };
        const res = await axios.post(`${API_BASE_URL}/api/routines/${routineId}/steps`, body);
        const newId = res.data?.step_id || res.data?.id || step.step_id;
        finalStepIds[i] = newId;
      }

      // Always send a reorder so positions match the pending order — the API
      // requires the full current list, which we now have.
      const desiredOrder = finalStepIds.filter((id) => id !== undefined && id !== null);
      if (desiredOrder.length > 1 && desiredOrder.length === pendingSteps.length) {
        try {
          await axios.patch(
            `${API_BASE_URL}/api/routines/${routineId}/steps/reorder`,
            { orderedStepIds: desiredOrder },
          );
        } catch (err) {
          showMessage('warning', t('routines:messages.reorderFailed'));
          console.error('Reorder failed:', err);
        }
      }

      showMessage('success', editingRoutine
        ? t('routines:messages.updated')
        : t('routines:messages.created'));
      setEditorOpen(false);
      await fetchAll();
    } catch (err) {
      showMessage('error', err.response?.data?.error || t('routines:messages.saveFailed'));
    } finally {
      setSavingRoutine(false);
    }
  };

  const handleDelete = async () => {
    const routine = deleteDialog.routine;
    if (!routine) return;
    try {
      await axios.delete(`${API_BASE_URL}/api/routines/${routine.id}`);
      setDeleteDialog({ open: false, routine: null });
      showMessage('success', t('routines:messages.deleted'));
      await fetchAll();
    } catch (err) {
      showMessage('error', err.response?.data?.error || t('routines:messages.saveFailed'));
    }
  };

  const getUserName = (userId) => {
    if (userId === null || userId === undefined || userId === '') return t('routines:list.unassigned');
    const user = users.find((u) => u.id === userId);
    return user ? user.username : t('routines:list.unassigned');
  };

  const formatDays = (crontab) => {
    const days = parseCrontabDays(crontab);
    if (days.length === 0) return '—';
    if (days.length === 7) return t('routines:list.everyDay');
    const weekdays = [1, 2, 3, 4, 5];
    if (weekdays.every((d) => days.includes(d)) && days.length === 5) return t('routines:list.weekdays');
    if (days.length === 2 && days.includes(0) && days.includes(6)) return t('routines:list.weekends');
    // getWeekdayLabels returns Sun-first when passed 0, so index === day number
    return days.map((d) => weekdayLabels[d]).join(', ');
  };

  const toggleDay = (day) => {
    setForm((prev) => {
      const next = prev.selectedDays.includes(day)
        ? prev.selectedDays.filter((d) => d !== day)
        : [...prev.selectedDays, day];
      return { ...prev, selectedDays: next };
    });
  };

  const setDayPreset = (days) => {
    setForm((prev) => ({ ...prev, selectedDays: [...days] }));
  };

  const isSaveDisabled = savingRoutine
    || !form.name.trim()
    || form.selectedDays.length === 0;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}
      {saveMessage?.show && (
        <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
          {saveMessage.text}
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6">{t('routines:tab.heading')}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<Refresh />} onClick={fetchAll} variant="outlined" size="small">
            {t('routines:list.refresh')}
          </Button>
          <Button startIcon={<Add />} onClick={openCreate} variant="contained" size="small">
            {t('routines:list.newRoutine')}
          </Button>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>{t('routines:tab.help')}</Alert>

      <TableContainer component={Paper} sx={{ mb: 4 }}>
        <Table size="small" sx={stackableTableSx}>
          <TableHead>
            <TableRow>
              <TableCell>{t('routines:list.name')}</TableCell>
              <TableCell>{t('routines:list.owner')}</TableCell>
              <TableCell>{t('routines:list.days')}</TableCell>
              <TableCell>{t('routines:list.startTime')}</TableCell>
              <TableCell>{t('routines:list.steps')}</TableCell>
              <TableCell>{t('routines:list.visible')}</TableCell>
              <TableCell>{t('routines:list.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {routines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                  <Typography color="text.secondary">{t('routines:list.noRoutines')}</Typography>
                </TableCell>
              </TableRow>
            ) : (
              routines.map((routine) => {
                const stepCount = Array.isArray(routine.steps) ? routine.steps.length : 0;
                return (
                  <TableRow key={routine.id} sx={{ opacity: routine.visible ? 1 : 0.5 }}>
                    <TableCell data-label={t('routines:list.name')}>
                      <Typography variant="body2" fontWeight="bold">
                        {routine.icon && <Box component="span" sx={{ mr: 0.75 }}>{routine.icon}</Box>}
                        {routine.name}
                      </Typography>
                    </TableCell>
                    <TableCell data-label={t('routines:list.owner')}>
                      <Chip
                        label={getUserName(routine.user_id)}
                        size="small"
                        variant={routine.user_id ? 'filled' : 'outlined'}
                        color={routine.user_id ? 'primary' : 'default'}
                      />
                    </TableCell>
                    <TableCell data-label={t('routines:list.days')}>
                      <Typography variant="body2">{formatDays(routine.crontab)}</Typography>
                    </TableCell>
                    <TableCell data-label={t('routines:list.startTime')}>
                      <Typography variant="body2">
                        {routine.start_time || <span style={{ opacity: 0.5 }}>—</span>}
                      </Typography>
                    </TableCell>
                    <TableCell data-label={t('routines:list.steps')}>
                      <Chip
                        label={t('routines:list.stepCount', { count: stepCount })}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell data-label={t('routines:list.visible')}>
                      {routine.visible ? '✓' : '—'}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title={t('routines:list.edit')}>
                          <IconButton size="small" color="primary" onClick={() => openEdit(routine)}>
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t('routines:list.delete')}>
                          <IconButton size="small" color="error" onClick={() => setDeleteDialog({ open: true, routine })}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ── TEMPLATES ─────────────────────────────────────── */}
      <Typography variant="h6" sx={{ mb: 1 }}>{t('routines:templates.heading')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('routines:templates.help')}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mb: 2 }}>
        {ROUTINE_TEMPLATES.map((tpl) => (
          <Paper key={tpl.id} variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              {tpl.icon && <Box component="span" sx={{ mr: 0.75 }}>{tpl.icon}</Box>}
              {t(tpl.nameKey)}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {tpl.steps.map((s) => (
                <Chip
                  key={s.titleKey}
                  size="small"
                  variant="outlined"
                  label={`${s.emoji} ${t(s.titleKey)}`}
                />
              ))}
            </Box>
            <Button
              size="small"
              variant="contained"
              startIcon={<Add />}
              onClick={() => applyTemplate(tpl)}
              sx={{ alignSelf: 'flex-start', mt: 'auto' }}
            >
              {t('routines:templates.use')}
            </Button>
          </Paper>
        ))}
      </Box>

      {/* ── ROUTINE EDITOR ────────────────────────────────── */}
      <Dialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
        slotProps={{
          paper: {
            component: 'form',
            onSubmit: (event) => {
              event.preventDefault();
              handleSaveRoutine();
            },
          },
        }}
      >
        <DialogTitle>
          {editingRoutine ? t('routines:editor.editTitle') : t('routines:editor.createTitle')}
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              fullWidth
              size="small"
              required
              label={t('routines:editor.nameLabel')}
              placeholder={t('routines:editor.namePlaceholder')}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />

            <FormControl fullWidth size="small">
              <InputLabel>{t('routines:editor.ownerLabel')}</InputLabel>
              <Select
                value={form.user_id}
                label={t('routines:editor.ownerLabel')}
                onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}
              >
                <MenuItem value="">{t('routines:editor.ownerAny')}</MenuItem>
                {users.map((u) => (
                  <MenuItem key={u.id} value={u.id}>{u.username}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <ChoreIconPicker
              value={form.icon}
              onChange={(icon) => setForm((f) => ({ ...f, icon }))}
            />

            <Divider textAlign="left">
              <Typography variant="overline">{t('routines:editor.scheduleHeading')}</Typography>
            </Divider>

            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {t('routines:editor.daysHelp')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                {ALL_DAYS.map((d) => (
                  <Chip
                    key={d}
                    label={weekdayLabels[d]}
                    clickable
                    color={form.selectedDays.includes(d) ? 'primary' : 'default'}
                    variant={form.selectedDays.includes(d) ? 'filled' : 'outlined'}
                    onClick={() => toggleDay(d)}
                    size="small"
                  />
                ))}
              </Box>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                <Button size="small" onClick={() => setDayPreset(ALL_DAYS)}>{t('routines:list.everyDay')}</Button>
                <Button size="small" onClick={() => setDayPreset(WEEKDAYS)}>{t('routines:list.weekdays')}</Button>
                <Button size="small" onClick={() => setDayPreset(WEEKENDS)}>{t('routines:list.weekends')}</Button>
              </Stack>
              {form.selectedDays.length === 0 && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  {t('routines:editor.selectAtLeastOneDay')}
                </Alert>
              )}
            </Box>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                size="small"
                label={t('routines:editor.startTimeLabel')}
                type="time"
                value={form.start_time}
                onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ flex: 1, minWidth: 140 }}
              />
              <TextField
                size="small"
                label={t('routines:editor.endTimeLabel')}
                type="time"
                value={form.end_time}
                onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ flex: 1, minWidth: 140 }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary">
              {t('routines:editor.timesHelp')}
            </Typography>

            <Divider textAlign="left">
              <Typography variant="overline">{t('routines:editor.streakHeading')}</Typography>
            </Divider>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                size="small"
                label={t('routines:editor.streakEveryLabel')}
                type="number"
                value={form.streak_bonus_every}
                onChange={(e) => setForm((f) => ({ ...f, streak_bonus_every: e.target.value.replace(/\D/g, '') }))}
                slotProps={{ htmlInput: { min: 0 } }}
                sx={{ flex: 1, minWidth: 140 }}
              />
              <TextField
                size="small"
                label={t('routines:editor.streakClamsLabel')}
                type="number"
                value={form.streak_bonus_clams}
                onChange={(e) => setForm((f) => ({ ...f, streak_bonus_clams: e.target.value.replace(/\D/g, '') }))}
                slotProps={{ htmlInput: { min: 0 } }}
                sx={{ flex: 1, minWidth: 140 }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary">
              {t('routines:editor.streakHelp')}
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  checked={form.visible}
                  onChange={(e) => setForm((f) => ({ ...f, visible: e.target.checked }))}
                />
              }
              label={t('routines:editor.visibleLabel')}
            />

            <Divider textAlign="left">
              <Typography variant="overline">{t('routines:editor.stepsHeading')}</Typography>
            </Divider>

            <Typography variant="body2" color="text.secondary">
              {t('routines:editor.stepsHelp')}
            </Typography>

            {pendingSteps.length === 0 ? (
              <Alert severity="info">{t('routines:editor.noSteps')}</Alert>
            ) : (
              <List dense disablePadding>
                {pendingSteps.map((step, index) => (
                  <ListItem
                    key={`${step.step_id ?? 'new'}-${index}`}
                    divider
                    secondaryAction={
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title={t('routines:editor.moveStepUp')}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => moveStep(index, -1)}
                              disabled={index === 0}
                              aria-label={t('routines:editor.moveStepUp')}
                            >
                              <KeyboardArrowUp fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={t('routines:editor.moveStepDown')}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => moveStep(index, 1)}
                              disabled={index === pendingSteps.length - 1}
                              aria-label={t('routines:editor.moveStepDown')}
                            >
                              <KeyboardArrowDown fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        {step.step_id && !step.isNew && (
                          <Tooltip title={t('routines:editor.editStep')}>
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => openStepEditor(step)}
                              aria-label={t('routines:editor.editStep')}
                            >
                              <Edit fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title={t('routines:editor.removeStep')}>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => removeStepAt(index)}
                            aria-label={t('routines:editor.removeStep')}
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    }
                  >
                    <ListItemText
                      primary={
                        <span>
                          {step.icon && <Box component="span" sx={{ mr: 0.75 }}>{step.icon}</Box>}
                          {step.title}
                        </span>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}

            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <Autocomplete
                freeSolo
                fullWidth
                value={newStepValue}
                onChange={(_, value) => setNewStepValue(value ?? '')}
                onInputChange={(_, value, reason) => {
                  if (reason === 'input') setNewStepValue(value);
                }}
                options={taskTitles}
                getOptionLabel={(option) => (typeof option === 'string' ? option : option?.title || '')}
                renderOption={(props, option) => (
                  <Box component="li" {...props} key={`${option.source}-${option.title}-${option.id ?? ''}`}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                      <span>{option.icon || '•'}</span>
                      <span style={{ flex: 1 }}>{option.title}</span>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={option.source === 'chore'
                          ? t('routines:editor.sourceChore')
                          : t('routines:editor.sourceStep')}
                      />
                    </Box>
                  </Box>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    size="small"
                    label={t('routines:editor.addStepLabel')}
                    placeholder={t('routines:editor.addStepPlaceholder')}
                    helperText={t('routines:editor.libraryHint')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addStepFromInput();
                      }
                    }}
                  />
                )}
                sx={{ flex: 1, minWidth: 220 }}
              />
              <Button
                variant="outlined"
                startIcon={<Add />}
                onClick={addStepFromInput}
                sx={{ alignSelf: 'center' }}
              >
                {t('routines:editor.addStepButton')}
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={() => setEditorOpen(false)} startIcon={<Cancel />}>
            {t('routines:editor.cancel')}
          </Button>
          <Button
            type="submit"
            variant="contained"
            startIcon={savingRoutine ? <CircularProgress size={16} /> : <Save />}
            disabled={isSaveDisabled}
          >
            {savingRoutine
              ? t('routines:editor.saving')
              : editingRoutine
                ? t('routines:editor.save')
                : t('routines:editor.create')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── STEP EDITOR (with 'used in N routines' warning) ─── */}
      <Dialog
        open={stepEditor.open}
        onClose={() => setStepEditor({ open: false, step: null, title: '' })}
        maxWidth="xs"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>{t('routines:stepEditor.title')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {(() => {
              const otherCount = Math.max(0, stepUsageCount(stepEditor.step?.step_id) - 1);
              return otherCount > 0 ? (
                <Alert severity="warning" icon={<Warning />}>
                  <div>{t('routines:stepEditor.usedInRoutines', { count: otherCount })}</div>
                  <div>{t('routines:stepEditor.warning')}</div>
                </Alert>
              ) : (
                <Alert severity="info">{t('routines:stepEditor.usedInNone')}</Alert>
              );
            })()}
            <TextField
              autoFocus
              fullWidth
              size="small"
              label={t('routines:stepEditor.titleField')}
              value={stepEditor.title}
              onChange={(e) => setStepEditor((prev) => ({ ...prev, title: e.target.value }))}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStepEditor({ open: false, step: null, title: '' })}>
            {t('routines:stepEditor.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={handleStepSave}
            disabled={savingStep || !stepEditor.title.trim()}
            startIcon={savingStep ? <CircularProgress size={16} /> : <Save />}
          >
            {t('routines:stepEditor.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── DELETE DIALOG ─────────────────────────────────── */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, routine: null })}
        maxWidth="xs"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning color="error" />
            {t('routines:delete.title')}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>{t('routines:delete.warning')}</Alert>
          <Typography variant="body2">
            {t('routines:delete.prompt', { name: deleteDialog.routine?.name || '' })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, routine: null })}>
            {t('routines:editor.cancel')}
          </Button>
          <Button onClick={handleDelete} variant="contained" color="error" startIcon={<Delete />}>
            {t('routines:list.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
