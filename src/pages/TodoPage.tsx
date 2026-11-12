import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CheckSquare,
  ListTodo,
  Plus,
  Repeat,
  Square,
  Trash2,
  Wallet,
} from 'lucide-react';
import { db } from '../db/database';
import type { TranslationDictionary } from '../i18n/translations';
import type {
  AppSettings,
  Category,
  PaymentMode,
  TaskPriority,
  TaskRecurrence,
  TodoSubtask,
  TodoTask,
} from '../types/models';
import { formatDateFriendly, formatINR, getTodayISO } from '../utils/formatters';
import type { ToastMessage } from '../components/GlobalOverlays';

interface TodoPageProps {
  tasks: TodoTask[];
  categories: Category[];
  settings: AppSettings;
  t: TranslationDictionary;
  onShowToast: (toast: ToastMessage) => void;
}

type TodoViewTab = 'today' | 'upcoming' | 'overdue' | 'completed';

export const TodoPage: React.FC<TodoPageProps> = ({
  tasks,
  categories,
  settings,
  t,
  onShowToast,
}) => {
  const todayIso = getTodayISO();
  const [viewTab, setViewTab] = useState<TodoViewTab>('today');
  const [showAddForm, setShowAddForm] = useState(false);

  // Task creation state
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(todayIso);
  const [dueTime, setDueTime] = useState('18:00');
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>('none');
  const [notes, setNotes] = useState('');
  const [tagsStr, setTagsStr] = useState('Bills');
  const [isMoneyLinked, setIsMoneyLinked] = useState(false);
  const [linkedAmount, setLinkedAmount] = useState('');
  const [linkedCategory, setLinkedCategory] = useState('Bills & Recharge');
  const [linkedPaymentMode, setLinkedPaymentMode] = useState<PaymentMode>('UPI');
  const [subtasksText, setSubtasksText] = useState('');

  const overdueTasks = useMemo(
    () => tasks.filter((task) => !task.completed && task.dueDate < todayIso),
    [tasks, todayIso]
  );

  // Browser notification check when TodoPage loads
  useEffect(() => {
    if (
      settings.notificationsEnabled &&
      overdueTasks.length > 0 &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      new Notification('SpendWise Overdue Tasks', {
        body: `You have ${overdueTasks.length} overdue task(s)/bill(s) awaiting action.`,
      });
    }
  }, [overdueTasks.length, settings.notificationsEnabled]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        if (viewTab === 'completed') return task.completed;
        if (task.completed) return false;
        if (viewTab === 'overdue') return task.dueDate < todayIso;
        if (viewTab === 'today') return task.dueDate === todayIso;
        return task.dueDate > todayIso;
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [tasks, viewTab, todayIso]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    // Parse optional subtask lines ("Milk 60" or "Rice 5kg - 650")
    const subtasks: TodoSubtask[] = subtasksText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => {
        const amtMatch = line.match(/[-:]?\s*(?:Rs\.?|₹)?\s*(\d+(?:\.\d{1,2})?)$/);
        return {
          id: `sub-${Date.now()}-${i}`,
          title: amtMatch ? line.replace(amtMatch[0], '').trim() : line,
          completed: false,
          estimatedAmount: amtMatch ? Number(amtMatch[1]) : undefined,
        };
      });

    const id = `task-${Date.now()}`;
    const newTask: TodoTask = {
      id,
      title: title.trim(),
      dueDate,
      dueTime: dueTime || undefined,
      priority,
      notes: notes.trim() || undefined,
      tags: tagsStr
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      completed: false,
      recurrence,
      isMoneyLinked,
      linkedAmount: isMoneyLinked && Number(linkedAmount) > 0 ? Number(linkedAmount) : undefined,
      linkedCategory: isMoneyLinked ? linkedCategory : undefined,
      linkedPaymentMode: isMoneyLinked ? linkedPaymentMode : undefined,
      subtasks,
    };

    await db.tasks.put(newTask);
    setTitle('');
    setNotes('');
    setLinkedAmount('');
    setSubtasksText('');
    setShowAddForm(false);

    onShowToast({
      id: `toast-${id}`,
      message: `Added task "${newTask.title}"`,
    });
  };

  const advanceNextDueDate = (currentIso: string, rec: TaskRecurrence): string => {
    const [y, m, d] = currentIso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (rec === 'daily') dt.setDate(dt.getDate() + 1);
    else if (rec === 'weekly') dt.setDate(dt.getDate() + 7);
    else if (rec === 'monthly') dt.setMonth(dt.getMonth() + 1);
    return getTodayISO(dt);
  };

  const handleCompleteOrMarkPaid = async (task: TodoTask, createExpense: boolean) => {
    const now = Date.now();
    let createdExpId: string | undefined;

    if (createExpense && task.linkedAmount && task.linkedAmount > 0) {
      createdExpId = `todo-exp-${now}`;
      await db.expenses.put({
        id: createdExpId,
        amount: task.linkedAmount,
        merchant: task.title,
        category: task.linkedCategory || 'Bills & Recharge',
        date: todayIso,
        timestamp: now,
        paymentMode: task.linkedPaymentMode || 'UPI',
        notes: `Marked paid from To-Do (${task.recurrence !== 'none' ? task.recurrence : 'one-time'})`,
        status: 'confirmed',
        source: 'todo',
      });
    }

    await db.tasks.update(task.id, {
      completed: true,
      completedAt: now,
      paidExpenseId: createdExpId,
    });

    // If recurring task, spawn the next occurrence automatically
    let spawnedNextId: string | undefined;
    if (task.recurrence !== 'none') {
      spawnedNextId = `task-rec-${now}`;
      await db.tasks.put({
        ...task,
        id: spawnedNextId,
        dueDate: advanceNextDueDate(task.dueDate, task.recurrence),
        completed: false,
        completedAt: undefined,
        paidExpenseId: undefined,
        subtasks: task.subtasks.map((s) => ({ ...s, completed: false, convertedExpenseId: undefined })),
      });
    }

    onShowToast({
      id: `task-done-${now}`,
      message: createExpense
        ? `Marked paid & added ${formatINR(task.linkedAmount ?? 0)} expense`
        : `Completed "${task.title}"`,
      undoLabel: 'Undo',
      onUndo: async () => {
        if (createdExpId) await db.expenses.delete(createdExpId);
        if (spawnedNextId) await db.tasks.delete(spawnedNextId);
        await db.tasks.update(task.id, {
          completed: false,
          completedAt: undefined,
          paidExpenseId: undefined,
        });
      },
    });
  };

  const handleToggleSubtask = async (
    task: TodoTask,
    sub: TodoSubtask,
    convertToExpense: boolean
  ) => {
    const nextCompleted = !sub.completed;
    let expId = sub.convertedExpenseId;

    if (nextCompleted && convertToExpense && sub.estimatedAmount && sub.estimatedAmount > 0) {
      expId = `sub-exp-${Date.now()}`;
      await db.expenses.put({
        id: expId,
        amount: sub.estimatedAmount,
        merchant: sub.title,
        category: 'Groceries',
        date: todayIso,
        timestamp: Date.now(),
        paymentMode: settings.defaultPaymentMode || 'UPI',
        notes: `Checklist item from "${task.title}"`,
        status: 'confirmed',
        source: 'todo',
      });
      onShowToast({
        id: `sub-toast-${expId}`,
        message: `Logged ${formatINR(sub.estimatedAmount)} for "${sub.title}"`,
      });
    }

    const updatedSubtasks = task.subtasks.map((item) =>
      item.id === sub.id
        ? { ...item, completed: nextCompleted, convertedExpenseId: expId }
        : item
    );
    await db.tasks.update(task.id, { subtasks: updatedSubtasks });
  };

  const requestBrowserNotifications = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      new Notification('SpendWise Reminders Active', {
        body: 'You will receive alerts for due bills and tasks while SpendWise is open.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t.todo.title}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Money-linked bill reminders, recurring tasks, and checklists that convert into expenses
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={requestBrowserNotifications}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer"
          >
            <Bell className="w-3.5 h-3.5 text-emerald-600" />
            <span>Enable Alerts</span>
          </button>
          <button
            onClick={() => setShowAddForm((prev) => !prev)}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t.todo.addTask}</span>
          </button>
        </div>
      </div>

      {/* In-App Overdue Banner when overdue tasks exist */}
      {overdueTasks.length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            <div>
              <p className="text-sm font-bold text-rose-900 dark:text-rose-200">
                {overdueTasks.length} Overdue Task(s) / Bill(s) Require Attention
              </p>
              <p className="text-xs text-rose-700 dark:text-rose-300">
                Includes: {overdueTasks.map((x) => x.title).join(', ')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setViewTab('overdue')}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold self-start sm:self-auto cursor-pointer"
          >
            Review Overdue ({overdueTasks.length})
          </button>
        </div>
      )}

      {/* New Task Creation Form */}
      {showAddForm && (
        <form
          onSubmit={handleCreateTask}
          className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
        >
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Create Task or Bill Reminder
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              placeholder="Task Title (e.g. Pay Electricity Bill)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="sm:col-span-2 min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="flex-1 min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
              />
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-28 min-h-[42px] px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              >
                <option value="High">High Priority</option>
                <option value="Medium">Medium Priority</option>
                <option value="Low">Low Priority</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Recurrence
              </label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as TaskRecurrence)}
                className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              >
                <option value="none">One-Time</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Tags (comma separated)
              </label>
              <input
                type="text"
                placeholder="Bills, Home, Urgent"
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
          </div>

          {/* Money-linked toggle */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3">
            <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer">
              <input
                type="checkbox"
                checked={isMoneyLinked}
                onChange={(e) => setIsMoneyLinked(e.target.checked)}
                className="w-4 h-4 rounded accent-emerald-600"
              />
              <span>Link to Expense ("Mark Paid" automatically creates an expense)</span>
            </label>

            {isMoneyLinked && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="number"
                  placeholder="Bill Amount (₹)"
                  value={linkedAmount}
                  onChange={(e) => setLinkedAmount(e.target.value)}
                  className="min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                />
                <select
                  value={linkedCategory}
                  onChange={(e) => setLinkedCategory(e.target.value)}
                  className="min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={linkedPaymentMode}
                  onChange={(e) => setLinkedPaymentMode(e.target.value as PaymentMode)}
                  className="min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                  <option value="Net Banking">Net Banking</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Subtasks / Grocery Checklist (1 per line, optional ₹ amount at end)
              </label>
              <textarea
                rows={3}
                placeholder={`Basmati Rice 5kg - 650\nFilter Coffee Powder - 280\nFresh Vegetables - 320`}
                value={subtasksText}
                onChange={(e) => setSubtasksText(e.target.value)}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Notes
              </label>
              <textarea
                rows={3}
                placeholder="Account / consumer number or reminder details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
            >
              Save Task
            </button>
          </div>
        </form>
      )}

      {/* Segmented View Tabs: Today | Upcoming | Overdue | Completed */}
      <div className="flex items-center gap-1 p-1.5 bg-slate-200/70 dark:bg-slate-900 rounded-2xl w-fit">
        {(
          [
            { id: 'today', label: t.todo.today, count: tasks.filter((x) => !x.completed && x.dueDate === todayIso).length },
            { id: 'upcoming', label: t.todo.upcoming, count: tasks.filter((x) => !x.completed && x.dueDate > todayIso).length },
            { id: 'overdue', label: t.todo.overdue, count: overdueTasks.length },
            { id: 'completed', label: t.todo.completed, count: tasks.filter((x) => x.completed).length },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setViewTab(tab.id)}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              viewTab === tab.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Tasks List */}
      {filteredTasks.length === 0 ? (
        <div className="p-12 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
          <ListTodo className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            No tasks in {viewTab} view
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTasks.map((task) => {
            const isOverdue = !task.completed && task.dueDate < todayIso;
            return (
              <div
                key={task.id}
                className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3
                        className={`text-base font-bold ${
                          task.completed
                            ? 'line-through text-slate-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {task.title}
                      </h3>
                      {/* Unboxed clean metadata with typographic separators */}
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        <span
                          className={
                            isOverdue
                              ? 'text-rose-600 dark:text-rose-400 font-semibold'
                              : ''
                          }
                        >
                          {formatDateFriendly(task.dueDate, todayIso)}
                          {task.dueTime ? ` at ${task.dueTime}` : ''}
                        </span>
                        {' · '}
                        <span>{task.priority} Priority</span>
                        {task.recurrence !== 'none' && (
                          <>
                            {' · '}
                            <span className="inline-flex items-center gap-0.5">
                              <Repeat className="w-3 h-3 inline" /> {task.recurrence}
                            </span>
                          </>
                        )}
                        {task.tags.length > 0 && ` · ${task.tags.join(' / ')}`}
                      </p>
                    </div>

                    {task.isMoneyLinked && task.linkedAmount && (
                      <div className="text-right shrink-0">
                        <span className="text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 block">
                          {formatINR(task.linkedAmount)}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {task.linkedCategory}
                        </span>
                      </div>
                    )}
                  </div>

                  {task.notes && (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {task.notes}
                    </p>
                  )}

                  {/* Subtasks / Grocery Checklist with Convert to Expense */}
                  {task.subtasks.length > 0 && (
                    <div className="pt-2 space-y-1.5 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-[11px] font-semibold text-slate-500">
                        Checklist (Tap &ldquo;+ Expense&rdquo; to log item spend)
                      </p>
                      {task.subtasks.map((sub) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between gap-2 py-1 text-xs"
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleSubtask(task, sub, false)}
                            className="flex items-center gap-2 text-left text-slate-800 dark:text-slate-200 cursor-pointer"
                          >
                            {sub.completed ? (
                              <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400 shrink-0" />
                            )}
                            <span className={sub.completed ? 'line-through text-slate-400' : ''}>
                              {sub.title}
                            </span>
                          </button>

                          {sub.estimatedAmount && (
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono text-slate-500">
                                {formatINR(sub.estimatedAmount)}
                              </span>
                              {!sub.convertedExpenseId ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleSubtask(task, sub, true)}
                                  className="px-2 py-0.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold cursor-pointer"
                                >
                                  + Expense
                                </button>
                              ) : (
                                <span className="text-[11px] text-emerald-600 font-medium">
                                  Logged
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bottom Action Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => db.tasks.delete(task.id)}
                    aria-label="Delete task"
                    className="min-h-[38px] px-2.5 rounded-xl text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>

                  {!task.completed && (
                    <div className="flex items-center gap-2">
                      {task.isMoneyLinked && task.linkedAmount ? (
                        <button
                          onClick={() => handleCompleteOrMarkPaid(task, true)}
                          className="min-h-[38px] px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>
                            {t.todo.markPaid} ({formatINR(task.linkedAmount)})
                          </span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleCompleteOrMarkPaid(task, false)}
                          className="min-h-[38px] px-4 py-1.5 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark Complete</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
