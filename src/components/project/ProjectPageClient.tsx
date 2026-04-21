"use client";

import { useState, useRef, useEffect, useMemo, useTransition, useCallback } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { getUiLocale } from "@/lib/ui-locale";
import type {
  ProjectWithRelations,
  ProjectColumn,
  SpreadsheetFilters,
  SpreadsheetSort,
  SpreadsheetSortColumn,
} from "@/lib/types";
import { NOTIF_TYPES, getNotifTypeLabel, getPriorityOptions, getStatusOptions } from "@/lib/constants";
import { setColumnActive, addProjectColumn, updateProjectDescription, createSavedView, listSavedViews, deleteSavedView, markNotificationRead, markAllNotificationsRead, getProjectLinks, addProjectLink, removeProjectLink, listProjects, getNotifPreferences, setNotifPreference } from "@/lib/actions";
import { InviteModal } from "./InviteModal";
import { SaveTemplateModal } from "./SaveTemplateModal";
import type { NotifType } from "@/lib/constants";
import { AVAILABLE_COLUMNS } from "@/lib/types";
import { ProjectSpreadsheet } from "./ProjectSpreadsheet";
import { ProjectCardsView } from "./ProjectCardsView";
import { ProjectKanbanView } from "./ProjectKanbanView";
import { ProjectCalendarView } from "./ProjectCalendarView";
import { ProjectGanttView } from "./ProjectGanttView";
import { ProjectTimelineView } from "./ProjectTimelineView";
import { ProjectDashboard } from "./ProjectDashboard";
import { ProjectActivityFeed } from "./ProjectActivityFeed";
import { ProjectProvider } from "./ProjectContext";
import { CommandPalette } from "./CommandPalette";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { AutomationsPanel } from "./AutomationsPanel";
import { trKey } from "@/lib/i18n/client";
import { useClientLocale } from "@/lib/i18n/useClientLocale";
import { getDisplayColumnLabel, getSystemColumnLabel } from "@/lib/i18n/columns";
import { useRealtimeSync } from "@/lib/useRealtimeSync";
import type { RealtimeScope } from "@/lib/realtime";

type Tab = "spreadsheet" | "cards" | "kanban" | "calendar" | "gantt" | "timeline" | "dashboard" | "activity";
type DisplayPrefs = {
  syncAcrossDevices?: boolean;
  defaultView?: "SPREADSHEET" | "KANBAN" | "CARDS" | "GANTT" | "TIMELINE" | "CALENDAR";
  density?: "compact" | "comfortable";
  mondayFirst?: boolean;
  dateFormat?: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  language?: "fr" | "en";
  themeMode?: "system" | "light" | "dark";
};
type ServerDisplaySettings = {
  syncAcrossDevices: boolean;
  defaultView: "SPREADSHEET" | "KANBAN" | "CARDS" | "GANTT" | "TIMELINE" | "CALENDAR";
  density: "compact" | "comfortable";
  mondayFirst: boolean;
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  language: "fr" | "en";
  themeMode: "system" | "light" | "dark";
};

type Member = { id: string; userId: string; role: string; user: { id: string; name: string; email: string; avatar: string | null } };

const VIEW_ICONS: Record<string, React.ReactNode> = {
  SPREADSHEET: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth="1.5" />
    </svg>
  ),
  CARDS: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
      <rect x="13" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
    </svg>
  ),
  KANBAN: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="4" width="5" height="14" rx="1" strokeWidth="1.5" />
      <rect x="9.5" y="4" width="5" height="9" rx="1" strokeWidth="1.5" />
      <rect x="16" y="4" width="5" height="6" rx="1" strokeWidth="1.5" />
    </svg>
  ),
  CALENDAR: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="16" rx="2" strokeWidth="1.5" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  GANTT: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M3 6h8M3 12h14M3 18h10" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="3" y="4.5" width="8" height="3" rx="1" strokeWidth="0" fill="currentColor" opacity="0.3" />
      <rect x="3" y="10.5" width="14" height="3" rx="1" strokeWidth="0" fill="currentColor" opacity="0.3" />
      <rect x="3" y="16.5" width="10" height="3" rx="1" strokeWidth="0" fill="currentColor" opacity="0.3" />
    </svg>
  ),
  TIMELINE: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="6" cy="7" r="1.5" fill="currentColor" strokeWidth="0" />
      <circle cx="6" cy="12" r="1.5" fill="currentColor" strokeWidth="0" />
      <circle cx="6" cy="17" r="1.5" fill="currentColor" strokeWidth="0" />
      <rect x="9" y="5.5" width="7" height="3" rx="1.5" strokeWidth="0" fill="currentColor" opacity="0.5" />
      <rect x="9" y="10.5" width="11" height="3" rx="1.5" strokeWidth="0" fill="currentColor" opacity="0.5" />
      <rect x="9" y="15.5" width="5" height="3" rx="1.5" strokeWidth="0" fill="currentColor" opacity="0.5" />
    </svg>
  ),
};

type NotificationItem = {
  id: string;
  type: string;
  message: string;
  taskId: string | null;
  projectId: string | null;
  isRead: boolean;
  createdAt: Date;
};

export function ProjectPageClient({
  project,
  allColumns,
  initialMembers,
  currentUserId,
  isGlobalAdmin,
  initialNotifications,
  initialUnreadCount,
  initialDisplaySettings,
}: {
  project: ProjectWithRelations;
  allColumns: ProjectColumn[];
  initialMembers: Member[];
  currentUserId: string | null;
  isGlobalAdmin: boolean;
  initialNotifications: NotificationItem[];
  initialUnreadCount: number;
  initialDisplaySettings: ServerDisplaySettings | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useClientLocale(pathname);
  const statusOptions = useMemo(() => getStatusOptions(locale), [locale]);
  const priorityOptions = useMemo(() => getPriorityOptions(locale), [locale]);
  const realtimeScopes = useMemo<RealtimeScope[]>(() => {
    const scopes = new Set<RealtimeScope>();
    scopes.add(`project:${project.id}`);
    if (currentUserId) scopes.add(`user:${currentUserId}`);
    if (isGlobalAdmin) scopes.add("global:admin");
    return Array.from(scopes);
  }, [currentUserId, isGlobalAdmin, project.id]);
  useRealtimeSync({
    scopes: realtimeScopes,
    enabled: realtimeScopes.length > 0,
  });
  const viewTypeToTab = (viewType: string | undefined): Tab => {
    if (viewType === "SPREADSHEET") return "spreadsheet";
    if (viewType === "CARDS") return "cards";
    if (viewType === "KANBAN") return "kanban";
    if (viewType === "CALENDAR") return "calendar";
    if (viewType === "GANTT") return "gantt";
    if (viewType === "TIMELINE") return "timeline";
    return "spreadsheet";
  };
  const projectDefault = project.views.find((v) => v.isDefault)?.type;
  const initialTab: Tab | null =
    initialDisplaySettings?.syncAcrossDevices
      ? viewTypeToTab(initialDisplaySettings.defaultView)
      : null;
  const [activeTab, setActiveTab] = useState<Tab | null>(initialTab);

  // Opening behavior: user display preference first, otherwise project default view.
  // Important: initialize only once per page load, otherwise router.refresh()
  // after task updates would force-switch the current tab back to default.
  useEffect(() => {
    if (activeTab !== null) return;

    if (initialDisplaySettings?.syncAcrossDevices) {
      const normalizedPrefs: DisplayPrefs = {
        syncAcrossDevices: true,
        defaultView: initialDisplaySettings.defaultView,
        density: initialDisplaySettings.density,
        mondayFirst: initialDisplaySettings.mondayFirst,
        dateFormat: initialDisplaySettings.dateFormat,
        language: initialDisplaySettings.language,
        themeMode: initialDisplaySettings.themeMode,
      };
      try {
        localStorage.setItem("taskapp:display-prefs", JSON.stringify(normalizedPrefs));
      } catch {
        // ignore storage issues
      }
      setActiveTab(viewTypeToTab(initialDisplaySettings.defaultView));
      return;
    }

    let cancelled = false;

    const applyInitialTab = () => {
      try {
        const rawPrefs = localStorage.getItem("taskapp:display-prefs");
        if (rawPrefs) {
          const prefs = JSON.parse(rawPrefs) as DisplayPrefs;
          const preferred = viewTypeToTab(prefs.defaultView);
          if (cancelled) return;
          setActiveTab(preferred);
          return;
        }
      } catch {
        // ignore parse issues
      }

      if (!cancelled) {
        setActiveTab(viewTypeToTab(projectDefault));
        return;
      }
    };

    applyInitialTab();
    return () => {
      cancelled = true;
    };
  }, [activeTab, initialDisplaySettings, project.id, projectDefault]);

  useEffect(() => {
    if (!initialDisplaySettings?.syncAcrossDevices) return;
    const normalizedPrefs: DisplayPrefs = {
      syncAcrossDevices: true,
      defaultView: initialDisplaySettings.defaultView,
      density: initialDisplaySettings.density,
      mondayFirst: initialDisplaySettings.mondayFirst,
      dateFormat: initialDisplaySettings.dateFormat,
      language: initialDisplaySettings.language,
      themeMode: initialDisplaySettings.themeMode,
    };
    try {
      localStorage.setItem("taskapp:display-prefs", JSON.stringify(normalizedPrefs));
    } catch {
      // ignore storage issues
    }
  }, [initialDisplaySettings]);

  useEffect(() => {
    const requestedTaskId = searchParams.get("taskId");
    if (!requestedTaskId) return;
    const group = project.groups.find((g) => g.tasks.some((t) => t.id === requestedTaskId));
    const task = group?.tasks.find((t) => t.id === requestedTaskId);
    if (!group || !task) return;
    setActiveTab("spreadsheet");
    setCmdPaletteTask({ task, groupName: group.name, groupColor: group.color });

    // One-shot deep link behavior: remove query param after opening the task.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("taskId");
      window.history.replaceState({}, "", url.toString());
    }
  }, [project.groups, searchParams]);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
  };
  const isFramelessTab =
    activeTab === "spreadsheet" || activeTab === "cards" || activeTab === "kanban";
  const MOBILE_TAB_ORDER: Tab[] = ["spreadsheet", "cards", "kanban", "calendar", "gantt", "timeline", "dashboard", "activity"];
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeEndRef = useRef<{ x: number; y: number } | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const pullScrollElRef = useRef<HTMLElement | null>(null);
  const canPullRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  const findScrollableAncestor = (from: HTMLElement | null): HTMLElement | null => {
    const root = mainRef.current;
    let current: HTMLElement | null = from;
    while (current && root && current !== root) {
      const style = window.getComputedStyle(current);
      const overflowY = style.overflowY;
      const isScrollable =
        (overflowY === "auto" || overflowY === "scroll") &&
        current.scrollHeight > current.clientHeight + 1;
      if (isScrollable) return current;
      current = current.parentElement;
    }
    if (root && root.scrollHeight > root.clientHeight + 1) return root;
    return null;
  };

  const switchTabBySwipeDelta = (delta: number) => {
    if (activeTab === null) return;
    if (activeTab === "kanban") return;
    const idx = MOBILE_TAB_ORDER.indexOf(activeTab);
    if (idx < 0) return;
    if (delta < 0 && idx < MOBILE_TAB_ORDER.length - 1) {
      setActiveTab(MOBILE_TAB_ORDER[idx + 1]);
    } else if (delta > 0 && idx > 0) {
      setActiveTab(MOBILE_TAB_ORDER[idx - 1]);
    }
  };

  const handleMainTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (!isMobileViewport) return;
    const target = e.target as HTMLElement;
    const touch = e.changedTouches[0];
    const canSwipe =
      !target.closest("input, textarea, select, button, [contenteditable='true']") &&
      !target.closest(".overflow-x-auto");
    if (canSwipe) {
      swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
      swipeEndRef.current = null;
    } else {
      swipeStartRef.current = null;
      swipeEndRef.current = null;
    }
    if (activeTab === "dashboard" || activeTab === "activity") return;
    if (isPullRefreshing) return;
    pullStartYRef.current = touch.clientY;
    pullScrollElRef.current = findScrollableAncestor(target);
    canPullRef.current = (pullScrollElRef.current?.scrollTop ?? 0) <= 0;
  };

  const handleMainTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    const touch = e.changedTouches[0];
    if (swipeStartRef.current) {
      swipeEndRef.current = { x: touch.clientX, y: touch.clientY };
    }
    if (activeTab === "dashboard" || activeTab === "activity") return;
    if (isPullRefreshing || !canPullRef.current || pullStartYRef.current === null) return;
    const startX = swipeStartRef.current?.x ?? touch.clientX;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - pullStartYRef.current;
    const mostlyVertical = Math.abs(dy) > Math.abs(dx) * 1.1;
    if (!mostlyVertical) return;
    if (dy <= 0) {
      setPullDistance(0);
      return;
    }
    e.preventDefault();
    setPullDistance(Math.min(88, dy * 0.45));
  };

  const handleMainTouchEnd = () => {
    if (activeTab !== "dashboard" && activeTab !== "activity" && !isPullRefreshing) {
      const shouldRefresh = pullDistance > 56;
      if (shouldRefresh) {
        setPullDistance(0);
        pullStartYRef.current = null;
        canPullRef.current = false;
        setIsPullRefreshing(true);
        window.setTimeout(() => {
          setIsPullRefreshing(false);
        }, 700);
        window.setTimeout(() => router.refresh(), 40);
        return;
      }
      setPullDistance(0);
      pullStartYRef.current = null;
      canPullRef.current = false;
    }
    if (!swipeStartRef.current || !swipeEndRef.current) return;
    const dx = swipeEndRef.current.x - swipeStartRef.current.x;
    const dy = swipeEndRef.current.y - swipeStartRef.current.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      switchTabBySwipeDelta(dx);
    }
    swipeStartRef.current = null;
    swipeEndRef.current = null;
  };
  const [activeColumnIds, setActiveColumnIds] = useState<Set<string>>(
    () => new Set(project.columns.map((c) => c.id))
  );
  const [, startColumnTransition] = useTransition();
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const currentMember = members.find((m) => m.userId === currentUserId);
  const isAdmin = isGlobalAdmin || currentMember?.role === "ADMIN";
  const isPersonalProject = Boolean((project as ProjectWithRelations & { isPersonal?: boolean }).isPersonal);
  const canInviteMembers = (isGlobalAdmin || Boolean(currentMember)) && !isPersonalProject;
  const canManageMembers = isAdmin;
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const initialProjectAvatar =
    (project as ProjectWithRelations & { avatar?: string | null }).avatar
      ? `/api/projects/${project.id}/avatar?t=${Date.now()}`
      : "";
  const [projectAvatar, setProjectAvatar] = useState(initialProjectAvatar);
  const [projectAvatarError, setProjectAvatarError] = useState<string | null>(null);
  const [projectAvatarRetryCount, setProjectAvatarRetryCount] = useState(0);
  const [, startAvatarTransition] = useTransition();
  const projectAvatarInputRef = useRef<HTMLInputElement>(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showNotifPrefs, setShowNotifPrefs] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<{ type: string; enabled: boolean }[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);
  const [cmdPaletteTask, setCmdPaletteTask] = useState<{ task: import("@/lib/types").TaskWithFields; groupName: string; groupColor: string } | null>(null);
  const [description, setDescription] = useState(project.description ?? "");
  const [editingDesc, setEditingDesc] = useState(false);
  const [, startDescTransition] = useTransition();
  const defaultView = project.views.find((v) => v.isDefault) ?? project.views[0];

  // --- Filter / sort / search / column visibility state ---
  const [filters, setFilters] = useState<SpreadsheetFilters>({
    status: [],
    priority: [],
    owner: [],
  });
  const [sort, setSort] = useState<SpreadsheetSort>(null);
  const [search, setSearch] = useState("");
  const [hiddenColumnIds, setHiddenColumnIds] = useState<string[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showSortPanel, setShowSortPanel] = useState(false);
  const [showColumnsPanel, setShowColumnsPanel] = useState(false);
  const [showViewsPanel, setShowViewsPanel] = useState(false);
  const [savedViews, setSavedViews] = useState<{ id: string; name: string; snapshot: string }[]>([]);
  const [viewsLoaded, setViewsLoaded] = useState(false);
  const [showAutomationsPanel, setShowAutomationsPanel] = useState(false);
  const [showLinksPanel, setShowLinksPanel] = useState(false);
  const [linkedProjects, setLinkedProjects] = useState<{ id: string; project: { id: string; name: string } }[]>([]);
  const [linksLoaded, setLinksLoaded] = useState(false);
  const [allProjects, setAllProjects] = useState<{ id: string; name: string }[]>([]);
  const [linksError, setLinksError] = useState("");
  const linksRef = useRef<HTMLDivElement>(null);
  const [saveViewName, setSaveViewName] = useState("");
  const [savingView, setSavingView] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const filterBtnRef = useRef<HTMLDivElement>(null);
  const sortBtnRef = useRef<HTMLDivElement>(null);
  const columnsBtnRef = useRef<HTMLDivElement>(null);
  const viewsBtnRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const closeSpreadsheetPanels = useCallback(() => {
    setShowFilterPanel(false);
    setShowSortPanel(false);
    setShowColumnsPanel(false);
    setShowViewsPanel(false);
  }, []);

  useEffect(() => {
    setNotifications(initialNotifications);
  }, [initialNotifications]);

  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);
  const getPanelPos = (rect: DOMRect, panelWidth: number) => {
    const margin = 8;
    const maxLeft = window.innerWidth - panelWidth - margin;
    return {
      top: rect.bottom + 4,
      left: Math.max(margin, Math.min(rect.left, maxLeft)),
    };
  };

  useEffect(() => {
    const sync = () => setIsMobileViewport(window.innerWidth < 640);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  // Close panels on outside click
  useEffect(() => {
    if (!showFilterPanel && !showSortPanel && !showColumnsPanel && !showViewsPanel && !showNotifPanel && !showLinksPanel) return;
    const handler = (e: MouseEvent) => {
      // Toolbar dropdowns: use single toolbarRef (covers buttons + panels)
      if ((showFilterPanel || showSortPanel || showColumnsPanel || showViewsPanel) &&
          toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        closeSpreadsheetPanels();
      }
      if (showNotifPanel && notifRef.current && !notifRef.current.contains(e.target as Node))
        setShowNotifPanel(false);
      if (showLinksPanel && linksRef.current && !linksRef.current.contains(e.target as Node))
        setShowLinksPanel(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [closeSpreadsheetPanels, showFilterPanel, showSortPanel, showColumnsPanel, showViewsPanel, showNotifPanel, showLinksPanel]);

  // Effective active columns: DB active + locally toggled
  const effectiveColumns = useMemo(
    () => allColumns.filter((c) => activeColumnIds.has(c.id)),
    [allColumns, activeColumnIds]
  );

  const visibleColumns = useMemo(
    () => effectiveColumns.filter((c: ProjectColumn) => !hiddenColumnIds.includes(c.id)),
    [effectiveColumns, hiddenColumnIds]
  );

  const toggleColumn = (colId: string) => {
    setHiddenColumnIds((prev) =>
      prev.includes(colId) ? prev.filter((id) => id !== colId) : [...prev, colId]
    );
  };

  const toggleColumnActive = (colId: string) => {
    const isActive = activeColumnIds.has(colId);
    setActiveColumnIds((prev) => {
      const next = new Set(prev);
      if (isActive) next.delete(colId); else next.add(colId);
      return next;
    });
    startColumnTransition(async () => { await setColumnActive(colId, !isActive); });
  };

  const handleAddMissingColumn = (type: string, label: string) => {
    startColumnTransition(async () => {
      const created = await addProjectColumn(project.id, type, label);
      setActiveColumnIds((prev) => new Set([...prev, created.id]));
      router.refresh();
    });
  };

  const handleProjectAvatarUpload = (file: File | null) => {
    if (!file) return;
    setProjectAvatarError(null);
    startAvatarTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("avatar", file);
        const response = await fetch(`/api/projects/${project.id}/avatar`, {
          method: "POST",
          body: formData,
        });
        const data = (await response.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
        if (!response.ok || !data.ok || !data.url) {
          setProjectAvatarError(data.error ?? "Import de l'avatar impossible.");
          return;
        }
        setProjectAvatarRetryCount(0);
        setProjectAvatar(data.url);
      } catch {
        setProjectAvatarError("Import de l'avatar impossible.");
      } finally {
        if (projectAvatarInputRef.current) {
          projectAvatarInputRef.current.value = "";
        }
      }
    });
  };

  // Keyboard shortcuts
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable;
      // / or Cmd+F → focus search (spreadsheet only)
      if (!isInput && (e.key === "/" || (e.metaKey && e.key === "f")) && activeTab === "spreadsheet") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      // ⌘K / Ctrl+K → command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette((v) => !v);
        return;
      }
      // ? → keyboard shortcuts help
      if (!isInput && e.key === "?") {
        e.preventDefault();
        setShowKeyboardHelp((v) => !v);
        return;
      }
      // Escape → close all panels
      if (e.key === "Escape") {
        setShowFilterPanel(false);
        setShowSortPanel(false);
        setShowColumnsPanel(false);
        setShowInviteModal(false);
        setShowCommandPalette(false);
        setShowKeyboardHelp(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTab]);

  // Unique owners across all tasks (for filter panel)
  const ownerCol = project.columns.find((c) => c.type === "OWNER");
  const ownerIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) {
      map.set(member.user.name.trim().toLowerCase(), member.user.id);
    }
    return map;
  }, [members]);
  const ownerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) {
      map.set(member.user.id, member.user.name);
    }
    return map;
  }, [members]);
  const normalizeOwnerFilterValue = useCallback((value: string | null | undefined) => {
    const raw = value?.trim();
    if (!raw) return "";
    return ownerNameById.has(raw) ? raw : ownerIdByName.get(raw.toLowerCase()) ?? raw;
  }, [ownerIdByName, ownerNameById]);
  const ownerFilterLabel = useCallback((value: string) => ownerNameById.get(value) ?? value, [ownerNameById]);
  const uniqueOwners = useMemo(() => {
    if (!ownerCol) return [];
    const set = new Set<string>();
    project.groups.forEach((g) =>
      g.tasks.forEach((t) => {
        const v = t.fieldValues.find((f) => f.columnId === ownerCol.id)?.value;
        const normalized = normalizeOwnerFilterValue(v);
        if (normalized) set.add(normalized);
      })
    );
    return Array.from(set).sort((a, b) => ownerFilterLabel(a).localeCompare(ownerFilterLabel(b), locale));
  }, [project, ownerCol, normalizeOwnerFilterValue, ownerFilterLabel, locale]);

  const activeFilterCount =
    filters.status.length + filters.priority.length + filters.owner.length;

  const toggleFilter = (key: keyof SpreadsheetFilters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((v) => v !== value)
        : [...prev[key], value],
    }));
  };

  const clearFilters = () =>
    setFilters({ status: [], priority: [], owner: [] });

  const handleSortPick = (key: SpreadsheetSortColumn) => {
    setSort((prev) => {
      if (!prev || prev.columnType !== key) return { columnType: key, dir: "asc" };
      if (prev.dir === "asc") return { columnType: key, dir: "desc" };
      return null;
    });
    setShowSortPanel(false);
  };

  const viewLabels: Record<string, string> = {
    SPREADSHEET: trKey(locale, "project.spreadsheet"),
    CARDS: trKey(locale, "project.cards"),
    KANBAN: "Kanban",
    CALENDAR: trKey(locale, "project.calendar"),
  };

  const sortOptions: { key: SpreadsheetSortColumn; label: string }[] = [
    { key: "TITLE", label: trKey(locale, "project.taskAZ") },
    { key: "STATUS", label: "Status" },
    { key: "PRIORITY", label: trKey(locale, "project.priority") },
    { key: "DUE_DATE", label: trKey(locale, "project.dueDate") },
  ];

  const sortLabel = sort
    ? sortOptions.find((o) => o.key === sort.columnType)?.label +
      (sort.dir === "asc" ? " ↑" : " ↓")
    : null;

  const exportCSV = () => {
    const cols = project.columns;
    const headers = [trKey(locale, "project.group"), trKey(locale, "project.task"), ...cols.map((c) => getDisplayColumnLabel(c, locale))];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows: string[] = [headers.map(escape).join(",")];
    for (const group of project.groups) {
      for (const task of group.tasks) {
        const cells = [group.name, task.title, ...cols.map((c) => {
          const raw = task.fieldValues.find((f) => f.columnId === c.id)?.value ?? "";
          if (c.type === "TIMELINE") {
            try { const p = JSON.parse(raw); return `${p.start ?? ""}→${p.end ?? ""}`; } catch { return raw; }
          }
          return raw;
        })];
        rows.push(cells.map(escape).join(","));
      }
    }
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!activeTab) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-sm text-gray-500 dark:text-gray-400">{trKey(locale, "project.loadingView")}</div>
      </div>
    );
  }

  return (
    <ProjectProvider
      memberNames={members.map((m) => m.user.name)}
      memberAvatars={Object.fromEntries(members.flatMap((m) => [[m.user.name, m.user.avatar], [m.user.id, m.user.avatar]]))}
      memberOptions={members.map((m) => ({ id: m.user.id, name: m.user.name, avatar: m.user.avatar }))}
      allColumns={allColumns}
    >
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* ── Top bar ── */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 sm:px-6 flex-shrink-0">
        <div className="flex items-center justify-between min-h-14 py-2 gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <a
              href="/"
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-sm flex items-center gap-1 flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {trKey(locale, "project.projects")}
            </a>
            <a
              href="/me"
              className="hidden sm:flex items-center gap-1 text-gray-400 dark:text-gray-500 hover:text-indigo-500 transition-colors text-xs border border-gray-200 dark:border-gray-700 hover:border-indigo-200 rounded-md px-2 py-1 flex-shrink-0"
              title={trKey(locale, "nav.mySpace")}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {trKey(locale, "nav.mySpace")}
            </a>
            <span className="text-gray-200 dark:text-gray-700">/</span>
            <div className="relative flex-shrink-0">
              {projectAvatar ? (
                <img
                  src={projectAvatar}
                  alt={`Avatar projet ${project.name}`}
                  className="w-6 h-6 rounded-md object-cover border border-gray-200 dark:border-gray-700"
                  onLoad={() => {
                    setProjectAvatarError(null);
                    setProjectAvatarRetryCount(0);
                  }}
                  onError={() => {
                    if (projectAvatarRetryCount < 2) {
                      setProjectAvatarRetryCount((n) => n + 1);
                      setProjectAvatar(`/api/projects/${project.id}/avatar?t=${Date.now()}`);
                      return;
                    }
                    setProjectAvatar("");
                    setProjectAvatarError("Avatar projet introuvable, veuillez le recharger.");
                  }}
                />
              ) : (
                <div className="w-6 h-6 rounded-md bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                    {project.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              {isAdmin && (
                <>
                  <input
                    ref={projectAvatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleProjectAvatarUpload(e.target.files?.[0] ?? null)}
                  />
                  <button
                    onClick={() => projectAvatarInputRef.current?.click()}
                    aria-label={trKey(locale, "project.editPicture")}
                    className="absolute -right-1 -bottom-1 w-4.5 h-4.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-indigo-500 flex items-center justify-center cursor-pointer"
                    title={trKey(locale, "project.editPicture")}
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M15.232 5.232l3.536 3.536M9 17l6.768-6.768a2.5 2.5 0 10-3.536-3.536L5.464 13.464A4 4 0 004 16.293V20h3.707A4 4 0 0010.536 18.536z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </>
              )}
            </div>
            <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate max-w-[45vw] sm:max-w-none">{project.name}</h1>
            {/* Description inline */}
            <span className="text-gray-200 dark:text-gray-700 hidden sm:block">·</span>
            {editingDesc ? (
              <input
                autoFocus
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  setEditingDesc(false);
                  startDescTransition(async () => {
                    await updateProjectDescription(project.id, description);
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") { setDescription(project.description ?? ""); setEditingDesc(false); }
                }}
                className="hidden sm:block text-xs text-gray-500 dark:text-gray-400 bg-transparent border-b border-indigo-400 outline-none w-48"
                placeholder={trKey(locale, "project.addDescription")}
              />
            ) : isAdmin ? (
              <button
                onClick={() => setEditingDesc(true)}
                className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer truncate max-w-[200px]"
              >
                {description || <span className="italic text-gray-300 dark:text-gray-600">{trKey(locale, "project.addDescription")}</span>}
              </button>
            ) : (
              <span className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 truncate max-w-[200px]">
                {description}
              </span>
            )}
            {projectAvatarError && (
              <span className="hidden sm:block text-[11px] text-red-500 truncate max-w-[220px]">
                {projectAvatarError}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-2 overflow-visible pl-1">
            {/* Notification bell */}
            {currentUserId && (
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => {
                    setShowNotifPanel((v) => !v);
                    setShowNotifPrefs(false);
                    if (!showNotifPanel && notifPrefs.length === 0) {
                      getNotifPreferences().then(setNotifPrefs);
                    }
                  }}
                  aria-label={trKey(locale, "project.notifications")}
                  className="relative p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  title={trKey(locale, "project.notifications")}
                >
                  <svg className="w-4.5 h-4.5 w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                {showNotifPanel && (
                  <div
                    className={[
                      "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-40 overflow-hidden",
                      "fixed left-2 right-2 top-16 max-h-[calc(100dvh-5.5rem)]",
                      "sm:absolute sm:top-full sm:mt-1.5 sm:right-0 sm:left-auto sm:w-[min(20rem,calc(100vw-1rem))] sm:max-h-none",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{trKey(locale, "project.notifications")}</h3>
                      <div className="flex items-center gap-2">
                        {unreadCount > 0 && !showNotifPrefs && (
                          <button
                            onClick={async () => {
                              setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
                              setUnreadCount(0);
                              await markAllNotificationsRead(currentUserId);
                              window.dispatchEvent(new CustomEvent("taskapp:badge-sync"));
                            }}
                            className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors cursor-pointer"
                          >
                            {trKey(locale, "project.markAllRead")}
                          </button>
                        )}
                        <button
                          onClick={() => setShowNotifPrefs((v) => !v)}
                          aria-label={trKey(locale, "project.notificationPreferences")}
                          title={trKey(locale, "project.notificationPreferences")}
                          className={`p-1 rounded-md transition-colors cursor-pointer ${showNotifPrefs ? "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200" : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth="1.5" />
                            <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth="1.5" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {showNotifPrefs ? (
                      <div className="px-4 py-3 space-y-3">
                        <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{trKey(locale, "project.receiveNotificationsFor")}</p>
                        {NOTIF_TYPES.map(({ type }) => {
                          const pref = notifPrefs.find((p) => p.type === type);
                          const enabled = pref?.enabled ?? true;
                          return (
                            <label key={type} className="flex items-center justify-between gap-3 cursor-pointer">
                              <span className="text-sm text-gray-700 dark:text-gray-200">{getNotifTypeLabel(type as NotifType, locale)}</span>
                              <button
                                role="switch"
                                aria-checked={enabled}
                                onClick={async () => {
                                  const next = !enabled;
                                  setNotifPrefs((prev) =>
                                    prev.some((p) => p.type === type)
                                      ? prev.map((p) => p.type === type ? { ...p, enabled: next } : p)
                                      : [...prev, { type, enabled: next }]
                                  );
                                  await setNotifPreference(type as NotifType, next);
                                }}
                                className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${enabled ? "bg-indigo-500" : "bg-gray-200 dark:bg-gray-600"}`}
                              >
                                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0"}`} />
                              </button>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                    <div className="max-h-[calc(100dvh-11rem)] sm:max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                          <svg className="w-8 h-8 text-gray-200 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                          <p className="text-xs text-gray-400">{trKey(locale, "project.noNotification")}</p>
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <div
                            key={notif.id}
                            className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/60 dark:hover:bg-gray-700/40 transition-colors cursor-pointer ${!notif.isRead ? "bg-indigo-50/40 dark:bg-indigo-900/20" : ""}`}
                            onClick={async () => {
                              if (!notif.isRead) {
                                setNotifications((prev) =>
                                  prev.map((n) => n.id === notif.id ? { ...n, isRead: true } : n)
                                );
                                setUnreadCount((c) => Math.max(0, c - 1));
                                await markNotificationRead(notif.id);
                                window.dispatchEvent(new CustomEvent("taskapp:badge-sync"));
                              }
                              if (notif.taskId) {
                                setShowNotifPanel(false);
                                const group = project.groups.find((g) =>
                                  g.tasks.some((t) => t.id === notif.taskId)
                                );
                                const task = group?.tasks.find((t) => t.id === notif.taskId);
                                if (task && group) {
                                  setActiveTab("spreadsheet");
                                  setCmdPaletteTask({ task, groupName: group.name, groupColor: group.color });
                                }
                              }
                            }}
                          >
                            <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${!notif.isRead ? "bg-indigo-500" : "bg-transparent"}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed">{notif.message}</p>
                              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                                {new Date(notif.createdAt).toLocaleDateString(getUiLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Member avatars — hidden on mobile */}
            {members.length > 0 && (
              <div className="hidden sm:flex items-center -space-x-1.5">
                {members.slice(0, 5).map((m) => (
                  <div
                    key={m.userId}
                    title={m.user.name}
                    className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-800 flex-shrink-0 overflow-hidden"
                  >
                    {m.user.avatar ? (
                      <img src={m.user.avatar} alt={m.user.name} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <div className="w-full h-full rounded-full bg-indigo-100 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-indigo-600">{m.user.name.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                ))}
                {members.length > 5 && (
                  <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 border-2 border-white dark:border-gray-800 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">+{members.length - 5}</span>
                  </div>
                )}
              </div>
            )}
            {isAdmin && (
              <button
                onClick={() => setShowAutomationsPanel(true)}
                className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 sm:px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                title={trKey(locale, "project.automations")}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="hidden sm:inline">{trKey(locale, "project.rules")}</span>
              </button>
            )}
            <button
              onClick={() => {
                if (isPersonalProject) return;
                setShowInviteModal(true);
              }}
              disabled={isPersonalProject}
              className={`flex items-center gap-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 sm:px-3 py-1.5 transition-colors ${
                isPersonalProject
                  ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                  : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              }`}
              title={isPersonalProject ? trKey(locale, "project.personalNoMembers") : (canInviteMembers ? trKey(locale, "project.inviteMembers") : trKey(locale, "project.viewMembers"))}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 4v16m8-8H4" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="hidden sm:inline">{canInviteMembers ? trKey(locale, "project.invite") : trKey(locale, "project.members")}</span>
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowSaveTemplate(true)}
                className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 sm:px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                title={trKey(locale, "project.saveAsTemplate")}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              <span className="hidden sm:inline">{trKey(locale, "project.template")}</span>
              </button>
            )}

            {/* Project links */}
            <div className="relative hidden sm:block" ref={linksRef}>
              <button
                onClick={async () => {
                  if (isPersonalProject) return;
                  setLinksError("");
                  setShowLinksPanel((v) => !v);
                  if (!linksLoaded) {
                    const [links, projects] = await Promise.all([
                      getProjectLinks(project.id),
                      listProjects(),
                    ]);
                    setLinkedProjects(links);
                    setAllProjects(projects
                      .filter((p) => p.id !== project.id && !(p as { isPersonal?: boolean }).isPersonal)
                      .map((p) => ({ id: p.id, name: p.name })));
                    setLinksLoaded(true);
                  }
                }}
                disabled={isPersonalProject}
                className={`flex items-center gap-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 sm:px-3 py-1.5 transition-colors ${
                  isPersonalProject
                    ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                }`}
                title={isPersonalProject ? trKey(locale, "project.personalNoLinks") : trKey(locale, "project.linkProjects")}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="hidden sm:inline">{trKey(locale, "project.link")}</span>
                {linkedProjects.length > 0 && (
                  <span className="ml-0.5 text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-full px-1.5 py-0.5 leading-none">
                    {linkedProjects.length}
                  </span>
                )}
              </button>

              {showLinksPanel && (
                <div className="absolute top-full mt-1.5 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-30 w-[min(18rem,calc(100vw-1rem))] overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{trKey(locale, "project.linkedProjects")}</h3>
                    <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                      {trKey(locale, "project.linkedProjectsHint")}
                    </p>
                  </div>
                  {linksError && (
                    <p className="px-4 pt-2 text-xs text-red-500">{linksError}</p>
                  )}
                  <div className="max-h-64 overflow-y-auto">
                    {linkedProjects.length === 0 ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">{trKey(locale, "project.noLinkedProject")}</p>
                    ) : (
                      linkedProjects.map((lp) => (
                        <div key={lp.id} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-700/40">
                          <a href={`/projects/${lp.project.id}`} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium truncate">
                            {lp.project.name}
                          </a>
                          <button
                            onClick={async () => {
                              try {
                                await removeProjectLink(lp.id, project.id);
                                setLinkedProjects((prev) => prev.filter((x) => x.id !== lp.id));
                              } catch (e) {
                                const message = e instanceof Error ? e.message : "";
                                if (message.includes("FORBIDDEN_LINK_PERSONAL_PROJECT")) {
                                  setLinksError(trKey(locale, "project.personalCannotBeLinked"));
                                  return;
                                }
                                setLinksError(trKey(locale, "project.unlinkFailed"));
                              }
                            }}
                            className="ml-2 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors cursor-pointer flex-shrink-0"
                            title="Dissocier"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path d="M6 18L18 6M6 6l12 12" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  {allProjects.filter((p) => !linkedProjects.some((lp) => lp.project.id === p.id)).length > 0 && (
                    <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700">
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2 font-medium uppercase tracking-wider">{trKey(locale, "project.linkAProject")}</p>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {allProjects
                          .filter((p) => !linkedProjects.some((lp) => lp.project.id === p.id))
                          .map((p) => (
                            <button
                              key={p.id}
                              onClick={async () => {
                                try {
                                  await addProjectLink(project.id, p.id);
                                  const updated = await getProjectLinks(project.id);
                                  setLinkedProjects(updated);
                                } catch (e) {
                                  const message = e instanceof Error ? e.message : "";
                                  if (message.includes("FORBIDDEN_LINK_PERSONAL_PROJECT")) {
                                    setLinksError(trKey(locale, "project.personalCannotBeLinked"));
                                    return;
                                  }
                                  setLinksError(trKey(locale, "project.linkFailed"));
                                }
                              }}
                              className="w-full text-left text-sm text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
                            >
                              {p.name}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── View tabs ── */}
        <div className="hidden sm:flex items-center gap-0.5 -mb-px overflow-x-auto scrollbar-none">
          <TabButton
            active={activeTab === "spreadsheet"}
            onClick={() => switchTab("spreadsheet")}
            icon={VIEW_ICONS[defaultView?.type ?? "SPREADSHEET"]}
          >
            {viewLabels[defaultView?.type ?? "SPREADSHEET"] ?? trKey(locale, "project.spreadsheet")}
          </TabButton>

          <TabButton
            active={activeTab === "cards"}
            onClick={() => switchTab("cards")}
            icon={VIEW_ICONS["CARDS"]}
          >
            {trKey(locale, "project.cards")}
          </TabButton>

          <TabButton
            active={activeTab === "kanban"}
            onClick={() => switchTab("kanban")}
            icon={VIEW_ICONS["KANBAN"]}
          >
            Kanban
          </TabButton>

          <TabButton
            active={activeTab === "calendar"}
            onClick={() => switchTab("calendar")}
            icon={VIEW_ICONS["CALENDAR"]}
          >
            {trKey(locale, "project.calendar")}
          </TabButton>

          <TabButton
            active={activeTab === "gantt"}
            onClick={() => switchTab("gantt")}
            icon={VIEW_ICONS["GANTT"]}
          >
            Gantt
          </TabButton>

          <TabButton
            active={activeTab === "timeline"}
            onClick={() => switchTab("timeline")}
            icon={VIEW_ICONS["TIMELINE"]}
          >
            {trKey(locale, "project.timeline")}
          </TabButton>

          <div className="mx-2 h-4 w-px bg-gray-200 dark:bg-gray-700" />

          <TabButton
            active={activeTab === "dashboard"}
            onClick={() => switchTab("dashboard")}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="3" width="8" height="5" rx="1" strokeWidth="1.5" />
                <rect x="13" y="3" width="8" height="9" rx="1" strokeWidth="1.5" />
                <rect x="3" y="10" width="8" height="11" rx="1" strokeWidth="1.5" />
                <rect x="13" y="14" width="8" height="7" rx="1" strokeWidth="1.5" />
              </svg>
            }
          >
            {trKey(locale, "project.dashboard")}
          </TabButton>

          <TabButton
            active={activeTab === "activity"}
            onClick={() => switchTab("activity")}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          >
            {trKey(locale, "project.activity")}
          </TabButton>
        </div>
      </header>

      {/* ── Toolbar (spreadsheet only) ── */}
      {activeTab === "spreadsheet" && (
        <div ref={toolbarRef} className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          {/* Scrollable button row */}
          <div className="px-4 sm:px-6 py-1.5 flex items-center gap-1 overflow-x-auto scrollbar-none">
          {/* Search input */}
          <div className="relative mr-1 flex-shrink-0">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={trKey(locale, "project.searchSlash")}
              className="pl-8 pr-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:bg-white dark:focus:bg-gray-600 transition-colors w-28 sm:w-44"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1 flex-shrink-0" />

          {/* Reset view button */}
          {(activeFilterCount > 0 || sort !== null || hiddenColumnIds.length > 0 || search) && (
            <button
              onClick={() => { clearFilters(); setSort(null); setHiddenColumnIds([]); setSearch(""); }}
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-500 transition-colors cursor-pointer flex-shrink-0"
              title={trKey(locale, "project.resetView")}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {trKey(locale, "project.reset")}
            </button>
          )}

          {/* Filter button */}
          <div ref={filterBtnRef} className="flex-shrink-0">
            <button
              onClick={() => {
                const rect = filterBtnRef.current?.getBoundingClientRect();
                if (rect) setPanelPos(getPanelPos(rect, 288));
                setShowFilterPanel((v) => !v);
                setShowSortPanel(false);
                setShowColumnsPanel(false);
                setShowViewsPanel(false);
              }}
              className={[
                "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors cursor-pointer",
                activeFilterCount > 0
                  ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700",
              ].join(" ")}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M3 6h18M3 12h12M3 18h6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">{trKey(locale, "project.filter")}</span>
              {activeFilterCount > 0 && (
                <span className="ml-0.5 bg-indigo-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

          </div>

          {/* Sort button */}
          <div ref={sortBtnRef} className="flex-shrink-0">
            <button
              onClick={() => {
                const rect = sortBtnRef.current?.getBoundingClientRect();
                if (rect) setPanelPos(getPanelPos(rect, 192));
                setShowSortPanel((v) => !v);
                setShowFilterPanel(false);
                setShowColumnsPanel(false);
                setShowViewsPanel(false);
              }}
              className={[
                "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors cursor-pointer",
                sort
                  ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700",
              ].join(" ")}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">{sortLabel ?? trKey(locale, "project.sort")}</span>
              <span className="sm:hidden">{sort ? "↕" : ""}</span>
              {sort && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setSort(null);
                  }}
                  className="ml-0.5 text-indigo-400 hover:text-indigo-700 leading-none"
                  title={trKey(locale, "project.clearSorting")}
                >
                  ×
                </span>
              )}
            </button>

          </div>

          {/* Columns button */}
          <div ref={columnsBtnRef} className="flex-shrink-0">
            <button
              onClick={() => {
                const rect = columnsBtnRef.current?.getBoundingClientRect();
                if (rect) setPanelPos(getPanelPos(rect, 240));
                setShowColumnsPanel((v) => !v);
                setShowFilterPanel(false);
                setShowSortPanel(false);
                setShowViewsPanel(false);
              }}
              className={[
                "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors cursor-pointer",
                hiddenColumnIds.length > 0
                  ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700",
              ].join(" ")}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="hidden sm:inline">{trKey(locale, "project.columns")}</span>
              {hiddenColumnIds.length > 0 && (
                <span className="ml-0.5 bg-indigo-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {hiddenColumnIds.length}
                </span>
              )}
            </button>

          </div>

          {/* Saved views */}
          <div ref={viewsBtnRef} className="flex-shrink-0">
            <button
              onClick={() => {
                const rect = viewsBtnRef.current?.getBoundingClientRect();
                if (rect) setPanelPos(getPanelPos(rect, 288));
                setShowViewsPanel((v) => !v);
                setShowFilterPanel(false);
                setShowSortPanel(false);
                setShowColumnsPanel(false);
                if (!viewsLoaded) {
                  listSavedViews(project.id).then((vs) => {
                    setSavedViews(vs);
                    setViewsLoaded(true);
                  });
                }
              }}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${showViewsPanel ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">{trKey(locale, "project.views")}</span>
              {savedViews.length > 0 && (
                <span className="ml-0.5 text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-full px-1.5 py-0.5 font-medium">
                  {savedViews.length}
                </span>
              )}
            </button>

          </div>

          {/* Export CSV + command palette */}
          <div className="ml-auto flex items-center gap-1 flex-shrink-0">
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer"
              title="Exporter en CSV"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 15V3m0 12l-4-4m4 4l4-4M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={() => setShowCommandPalette(true)}
              className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1.5 rounded-md transition-colors cursor-pointer"
              title="Command palette (⌘K)"
            >
              <kbd className="text-[10px] border border-gray-200 dark:border-gray-600 rounded px-1 font-mono">⌘K</kbd>
            </button>
            <button
              onClick={() => setShowKeyboardHelp(true)}
              className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1.5 rounded-md transition-colors cursor-pointer"
              title={trKey(locale, "project.keyboardShortcutsHint")}
            >
              <kbd className="text-[10px] border border-gray-200 dark:border-gray-600 rounded px-1 font-mono">?</kbd>
            </button>
          </div>

          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-1 ml-2">
              {filters.status.map((v) => {
                const opt = statusOptions.find((o) => o.value === v);
                return (
                  <span
                    key={v}
                    className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 rounded-full px-2 py-0.5"
                  >
                    {opt?.label ?? v}
                    <button
                      onClick={() => toggleFilter("status", v)}
                      className="text-indigo-400 hover:text-indigo-700 cursor-pointer leading-none"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              {filters.priority.map((v) => {
                const opt = priorityOptions.find((o) => o.value === v);
                return (
                  <span
                    key={v}
                    className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 rounded-full px-2 py-0.5"
                  >
                    {opt?.label ?? v}
                    <button
                      onClick={() => toggleFilter("priority", v)}
                      className="text-indigo-400 hover:text-indigo-700 cursor-pointer leading-none"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              {filters.owner.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 rounded-full px-2 py-0.5"
                >
                  {ownerFilterLabel(v)}
                  <button
                    onClick={() => toggleFilter("owner", v)}
                    className="text-indigo-400 hover:text-indigo-700 cursor-pointer leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          </div>{/* end scrollable row */}

          {/* ── Dropdown panels — hors du div overflow pour éviter le clipping ── */}
          {isMobileViewport && (showFilterPanel || showSortPanel || showColumnsPanel || showViewsPanel) && (
            <button
              type="button"
              onClick={() => {
                setShowFilterPanel(false);
                setShowSortPanel(false);
                setShowColumnsPanel(false);
                setShowViewsPanel(false);
              }}
              className="fixed inset-0 z-40 bg-black/20"
              aria-label={trKey(locale, "project.closePanels")}
            />
          )}
          {showFilterPanel && (
            <div
              style={isMobileViewport ? undefined : { position: "fixed", top: panelPos.top, left: panelPos.left, zIndex: 50 }}
              className={isMobileViewport
                ? "fixed inset-x-3 bottom-3 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-lg p-4 max-h-[72vh] overflow-y-auto"
                : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-4 w-72"}
            >
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Status</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {statusOptions.map((opt) => (
                  <button key={opt.value} onClick={() => toggleFilter("status", opt.value)}
                    className={["text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer", filters.status.includes(opt.value) ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400" : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500"].join(" ")}
                  >{opt.label}</button>
                ))}
              </div>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">{trKey(locale, "project.priority")}</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {priorityOptions.map((opt) => (
                  <button key={opt.value} onClick={() => toggleFilter("priority", opt.value)}
                    className={["text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer", filters.priority.includes(opt.value) ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400" : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500"].join(" ")}
                  >{opt.label}</button>
                ))}
              </div>
              {uniqueOwners.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">{trKey(locale, "project.owner")}</p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {uniqueOwners.map((name) => (
                      <button key={name} onClick={() => toggleFilter("owner", name)}
                        className={["text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer", filters.owner.includes(name) ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400" : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500"].join(" ")}
                      >{ownerFilterLabel(name)}</button>
                    ))}
                  </div>
                </>
              )}
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 transition-colors cursor-pointer">{trKey(locale, "project.clearAll")}</button>
              )}
            </div>
          )}

          {showSortPanel && (
            <div
              style={isMobileViewport ? undefined : { position: "fixed", top: panelPos.top, left: panelPos.left, zIndex: 50 }}
              className={isMobileViewport
                ? "fixed inset-x-3 bottom-3 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-lg py-2 max-h-[72vh] overflow-y-auto"
                : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 w-48"}
            >
              {sortOptions.map((opt) => {
                const active = sort?.columnType === opt.key;
                return (
                  <button key={opt.key} onClick={() => handleSortPick(opt.key)}
                    className={["w-full text-left flex items-center justify-between px-3 py-2 text-sm transition-colors cursor-pointer", active ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"].join(" ")}
                  >
                    {opt.label}
                    {active && <span className="text-indigo-500 text-xs">{sort?.dir === "asc" ? "↑" : "↓"}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {showColumnsPanel && (
            <div
              style={isMobileViewport ? undefined : { position: "fixed", top: panelPos.top, left: panelPos.left, zIndex: 50 }}
              className={isMobileViewport
                ? "fixed inset-x-3 bottom-3 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-lg p-4 max-h-[72vh] overflow-y-auto"
                : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-4 w-60"}
            >
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">{trKey(locale, "project.activeColumns")}</p>
              <div className="space-y-0.5 mb-3">
                {effectiveColumns.map((col) => {
                  const visible = !hiddenColumnIds.includes(col.id);
                  return (
                    <button key={col.id} onClick={() => toggleColumn(col.id)}
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer text-left"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${visible ? "bg-indigo-500 border-indigo-500" : "border-gray-300 dark:border-gray-600"}`}>
                        {visible && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </div>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{getDisplayColumnLabel(col, locale)}</span>
                    </button>
                  );
                })}
              </div>
              {(() => {
                const inactiveDbCols = allColumns.filter((c) => !activeColumnIds.has(c.id));
                const existingTypes = new Set(allColumns.map((c) => c.type));
                const missingMeta = AVAILABLE_COLUMNS.filter((m) => !existingTypes.has(m.type));
                if (inactiveDbCols.length === 0 && missingMeta.length === 0) return null;
                return (
                  <>
                    <div className="border-t border-gray-100 dark:border-gray-700 my-2" />
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">{trKey(locale, "project.addColumn")}</p>
                    <div className="space-y-0.5">
                      {inactiveDbCols.map((col) => (
                        <button key={col.id} onClick={() => toggleColumnActive(col.id)}
                          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors cursor-pointer text-left group"
                        >
                          <div className="w-4 h-4 rounded border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center flex-shrink-0 group-hover:border-indigo-400">
                            <svg className="w-2.5 h-2.5 text-gray-300 dark:text-gray-600 group-hover:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth="2" strokeLinecap="round" /></svg>
                          </div>
                          <span className="text-sm text-gray-400 dark:text-gray-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{getDisplayColumnLabel(col, locale)}</span>
                        </button>
                      ))}
                      {missingMeta.map((meta) => (
                        <button key={meta.type} onClick={() => handleAddMissingColumn(meta.type, getSystemColumnLabel(meta.type, locale))}
                          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors cursor-pointer text-left group"
                        >
                          <div className="w-4 h-4 rounded border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center flex-shrink-0 group-hover:border-indigo-400">
                            <svg className="w-2.5 h-2.5 text-gray-300 dark:text-gray-600 group-hover:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth="2" strokeLinecap="round" /></svg>
                          </div>
                          <span className="text-sm text-gray-400 dark:text-gray-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{getSystemColumnLabel(meta.type, locale)}</span>
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()}
              {hiddenColumnIds.length > 0 && (
                <button onClick={() => setHiddenColumnIds([])} className="mt-3 text-xs text-indigo-500 hover:text-indigo-700 transition-colors cursor-pointer">Tout afficher</button>
              )}
            </div>
          )}

          {showViewsPanel && (
            <div
              style={isMobileViewport ? undefined : { position: "fixed", top: panelPos.top, left: panelPos.left, zIndex: 50 }}
              className={isMobileViewport
                ? "fixed inset-x-3 bottom-3 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl py-2 max-h-[72vh] overflow-y-auto"
                : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl w-72 py-2"}
            >
              <div className="px-3 pb-2 border-b border-gray-100 dark:border-gray-700">
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{trKey(locale, "project.saveCurrentView")}</p>
                <div className="flex flex-col gap-2">
                  <input type="text" value={saveViewName} onChange={(e) => setSaveViewName(e.target.value)} placeholder={trKey(locale, "project.viewName")}
                    className="w-full text-xs text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 placeholder-gray-400 dark:placeholder-gray-500"
                    onKeyDown={(e) => { if (e.key === "Enter") document.getElementById("save-view-btn")?.click(); }}
                  />
                  <button id="save-view-btn" disabled={savingView || !saveViewName.trim()}
                    onClick={async () => {
                      if (!saveViewName.trim()) return;
                      setSavingView(true);
                      try {
                        const snap = { tab: activeTab, filters, sort: sort ?? null, visibleColumnIds: visibleColumns.map((c) => c.id), search };
                        const created = await createSavedView(project.id, saveViewName, snap);
                        setSavedViews((prev) => [...prev, { id: created.id, name: created.name, snapshot: created.snapshot }]);
                        setSaveViewName("");
                      } finally { setSavingView(false); }
                    }}
                    className="w-full text-xs bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer disabled:cursor-default"
                  >{savingView ? "…" : trKey(locale, "project.saveView")}</button>
                </div>
              </div>
              <div className="px-3 pt-2">
                {!viewsLoaded ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 py-1">{trKey(locale, "project.loading")}</p>
                ) : savedViews.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic py-1">{trKey(locale, "project.noSavedView")}</p>
                ) : (
                  <div className="space-y-0.5">
                    {savedViews.map((sv) => {
                      const snap = JSON.parse(sv.snapshot) as { tab: string; filters: { status: string[]; priority: string[]; owner: string[] }; sort: { columnType: string; dir: "asc" | "desc" } | null; visibleColumnIds: string[]; search: string };
                      return (
                        <div key={sv.id} className="flex items-center gap-1 group/sv">
                          <button
                            onClick={() => {
                              setActiveTab(snap.tab as typeof activeTab);
                              setFilters(snap.filters);
                              setSort(snap.sort ? { columnType: snap.sort.columnType as import("@/lib/types").SpreadsheetSortColumn, dir: snap.sort.dir } : null);
                              setSearch(snap.search);
                              const visIds = new Set(snap.visibleColumnIds);
                              setHiddenColumnIds(project.columns.filter((c) => !visIds.has(c.id)).map((c) => c.id));
                              setShowViewsPanel(false);
                            }}
                            className="flex-1 text-left text-xs text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer"
                          >
                            {sv.name}
                            <span className="ml-1.5 text-[10px] text-gray-400 dark:text-gray-500">{snap.tab}</span>
                          </button>
                          <button
                            onClick={async () => { setSavedViews((prev) => prev.filter((v) => v.id !== sv.id)); await deleteSavedView(sv.id); }}
                            className="opacity-0 group-hover/sv:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 transition-all cursor-pointer"
                            title={trKey(locale, "project.deleteThisView")}
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" /></svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Content ── */}
      <main
        ref={mainRef}
        className={[
          "flex-1 mx-0 sm:mx-6 mt-2 sm:mt-4 mb-3 sm:mb-6 pb-20 sm:pb-0 mobile-safe-nav-pad touch-pan-y",
          isFramelessTab
            ? "bg-transparent border-0 shadow-none rounded-none overflow-visible"
            : "mobile-surface sm:bg-white sm:dark:bg-gray-800 rounded-none sm:rounded-xl overflow-hidden",
        ].join(" ")}
        onTouchStart={handleMainTouchStart}
        onTouchMove={handleMainTouchMove}
        onTouchEnd={handleMainTouchEnd}
      >
        {isMobileViewport && activeTab !== "dashboard" && activeTab !== "activity" && (
          <div className="sticky top-0 z-10 flex justify-center pointer-events-none">
            <div
              className={[
                "text-[11px] px-2.5 py-1 rounded-full border transition-all mt-1",
                isPullRefreshing
                  ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                  : "bg-white/90 dark:bg-gray-800/90 text-gray-400 border-gray-200 dark:border-gray-700",
                pullDistance > 0 || isPullRefreshing ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1",
              ].join(" ")}
              style={{ transform: `translateY(${Math.min(pullDistance / 3, 10)}px)` }}
            >
              {isPullRefreshing
                ? trKey(locale, "project.refreshing")
                : pullDistance > 56
                ? trKey(locale, "project.releaseToRefresh")
                : trKey(locale, "project.pullToRefresh")}
            </div>
          </div>
        )}
        {activeTab === "spreadsheet" && (
          <ProjectSpreadsheet
            project={project}
            filters={filters}
            sort={sort}
            visibleColumns={visibleColumns}
            search={search}
            memberNames={members.map((m) => m.user.name)}
          />
        )}
        {activeTab === "cards" && (
          <ProjectCardsView project={project} />
        )}
        {activeTab === "kanban" && (
          <ProjectKanbanView project={project} />
        )}
        {activeTab === "calendar" && (
          <ProjectCalendarView project={project} />
        )}
        {activeTab === "gantt" && (
          <ProjectGanttView project={project} />
        )}
        {activeTab === "timeline" && (
          <ProjectTimelineView project={project} allColumns={allColumns} />
        )}
        {activeTab === "dashboard" && (
          <ProjectDashboard project={project} />
        )}
        {activeTab === "activity" && (
          <ProjectActivityFeed
            projectId={project.id}
            onOpenTask={(taskId) => {
              const task = project.groups.flatMap((g) => g.tasks).find((t) => t.id === taskId);
              const group = project.groups.find((g) => g.tasks.some((t) => t.id === taskId));
              if (task && group) {
                setCmdPaletteTask({ task, groupName: group.name, groupColor: group.color });
              }
            }}
          />
        )}
      </main>

      {isMobileViewport && (
        <nav className="sm:hidden fixed left-1/2 -translate-x-1/2 w-[min(90vw,22rem)] mobile-safe-bottom z-40 rounded-2xl border border-gray-200/80 dark:border-gray-700/80 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl shadow-[0_18px_40px_-24px_rgba(15,23,42,0.5)]">
          <div className="flex overflow-x-auto scrollbar-none px-1 py-1 gap-0.5">
            {([
              { key: "spreadsheet", label: trKey(locale, "project.spreadsheet"), icon: VIEW_ICONS["SPREADSHEET"] },
              { key: "cards", label: trKey(locale, "project.cards"), icon: VIEW_ICONS["CARDS"] },
              { key: "kanban", label: "Kanban", icon: VIEW_ICONS["KANBAN"] },
              { key: "calendar", label: trKey(locale, "project.calendar"), icon: VIEW_ICONS["CALENDAR"] },
              { key: "gantt", label: "Gantt", icon: VIEW_ICONS["GANTT"] },
              { key: "timeline", label: trKey(locale, "project.timeline"), icon: VIEW_ICONS["TIMELINE"] },
              { key: "dashboard", label: trKey(locale, "project.dashboard"), icon: (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="3" width="8" height="5" rx="1" strokeWidth="1.5" />
                  <rect x="13" y="3" width="8" height="9" rx="1" strokeWidth="1.5" />
                  <rect x="3" y="10" width="8" height="11" rx="1" strokeWidth="1.5" />
                  <rect x="13" y="14" width="8" height="7" rx="1" strokeWidth="1.5" />
                </svg>
              ) },
              { key: "activity", label: trKey(locale, "project.activity"), icon: (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) },
            ] as const).map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => switchTab(tab.key)}
                  className={[
                    "min-w-[62px] min-h-10 px-1.5 rounded-xl flex flex-col items-center justify-center text-[9px] font-medium",
                    active
                      ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300"
                      : "text-gray-500 dark:text-gray-400",
                  ].join(" ")}
                >
                  {tab.icon}
                  <span className="mt-0.5 whitespace-nowrap">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {showInviteModal && (
        <InviteModal
          projectId={project.id}
          members={members}
          canInvite={canInviteMembers}
          canManageMembers={canManageMembers}
          onClose={() => setShowInviteModal(false)}
          onMemberRemoved={(uid) => setMembers((prev) => prev.filter((m) => m.userId !== uid))}
          onMemberUpdated={(m) => setMembers((prev) => prev.map((x) => x.userId === m.userId ? m : x))}
        />
      )}
      {showSaveTemplate && (
        <SaveTemplateModal
          projectId={project.id}
          projectName={project.name}
          onClose={() => setShowSaveTemplate(false)}
        />
      )}
      {showAutomationsPanel && (
        <AutomationsPanel
          projectId={project.id}
          onClose={() => setShowAutomationsPanel(false)}
        />
      )}
      {showKeyboardHelp && (
        <KeyboardShortcutsModal locale={locale} onClose={() => setShowKeyboardHelp(false)} />
      )}
      {showCommandPalette && (
        <CommandPalette
          project={project}
          onClose={() => setShowCommandPalette(false)}
          onOpenTask={(task, groupName, groupColor) => setCmdPaletteTask({ task, groupName, groupColor })}
          onSwitchTab={(tab) => setActiveTab(tab as typeof activeTab)}
          onAddTask={(groupId) => {
            setActiveTab("spreadsheet");
            // Signal the spreadsheet to focus the new task row for that group
            // (handled by setting a pending group in state)
          }}
        />
      )}
      {cmdPaletteTask && (
        <TaskDetailPanel
          task={cmdPaletteTask.task}
          columns={allColumns}
          groupName={cmdPaletteTask.groupName}
          groupColor={cmdPaletteTask.groupColor}
          projectId={project.id}
          readOnlyOwner={isPersonalProject}
          onClose={() => setCmdPaletteTask(null)}
          onFieldUpdate={(columnId, value) => {
            import("@/lib/actions").then(({ upsertTaskField }) =>
              upsertTaskField(cmdPaletteTask.task.id, columnId, value)
            );
          }}
          onTitleUpdate={(title) => {
            import("@/lib/actions").then(({ updateTaskTitle }) =>
              updateTaskTitle(cmdPaletteTask.task.id, title)
            );
          }}
        />
      )}
    </div>
    </ProjectProvider>
  );
}

function KeyboardShortcutsModal({ onClose, locale }: { onClose: () => void; locale: "fr" | "en" }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const sections = [
    {
      title: "Navigation",
      shortcuts: [
        { keys: ["⌘K"], label: trKey(locale, "project.openCommandPalette") },
        { keys: ["?"], label: trKey(locale, "project.showKeyboardShortcuts") },
        { keys: ["/", "⌘F"], label: trKey(locale, "project.searchSpreadsheetView") },
        { keys: [trKey(locale, "project.esc")], label: trKey(locale, "project.closeCancel") },
      ],
    },
    {
      title: trKey(locale, "project.views"),
      shortcuts: [
        { keys: ["⌘K", trKey(locale, "project.then"), "T"], label: trKey(locale, "project.spreadsheet") },
        { keys: ["⌘K", trKey(locale, "project.then"), "K"], label: "Kanban" },
        { keys: ["⌘K", trKey(locale, "project.then"), "C"], label: trKey(locale, "project.cards") },
        { keys: ["⌘K", trKey(locale, "project.then"), "G"], label: "Gantt" },
      ],
    },
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">{trKey(locale, "project.keyboardShortcuts")}</h2>
            <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
          <div className="px-5 py-4 space-y-5">
            {sections.map((section) => (
              <div key={section.title}>
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">{section.title}</p>
                <div className="space-y-1.5">
                  {section.shortcuts.map((s, i) => (
                    <div key={i} className="flex items-center justify-between gap-4">
                      <span className="text-sm text-gray-600 dark:text-gray-300">{s.label}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {s.keys.map((k, ki) => (
                          (k === "puis" || k === "then") ? (
                            <span key={ki} className="text-[10px] text-gray-400 dark:text-gray-500">{trKey(locale, "project.then")}</span>
                          ) : (
                            <kbd key={ki} className="text-[10px] font-mono border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700">{k}</kbd>
                          )
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 text-center">
            <span className="text-[11px] text-gray-400 dark:text-gray-500">{trKey(locale, "project.press")} <kbd className="font-mono border border-gray-200 dark:border-gray-600 rounded px-1 text-[10px]">?</kbd> {trKey(locale, "project.or")} <kbd className="font-mono border border-gray-200 dark:border-gray-600 rounded px-1 text-[10px]">{trKey(locale, "project.esc")}</kbd> {trKey(locale, "project.toClose")}</span>
          </div>
        </div>
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex items-center gap-1.5 px-3 min-h-11 py-2.5 text-sm font-medium border-b-2 transition-colors",
        disabled
          ? "border-transparent text-gray-300 dark:text-gray-600 cursor-default"
          : active
          ? "border-indigo-600 text-indigo-600 cursor-pointer"
          : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer",
      ].join(" ")}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}
