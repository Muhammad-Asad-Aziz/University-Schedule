    // --------- Constants and Utilities ---------
    const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const WEEKDAY_COUNT = 5;
    const START_MIN = 8 * 60;  // 8:00
    const END_MIN   = 17.5 * 60;   // 17:30
    const SLOT = 30; // minutes

    // Handle overnight by adding 24h when end is "before" start
    let effectiveEnd = END_MIN;
    if (effectiveEnd <= START_MIN) {
      effectiveEnd += 24 * 60; // 24h wrap
    }

    const SLOTS = Array.from(
      { length: ((effectiveEnd - START_MIN) / SLOT) + 1 },
      (_, i) => (START_MIN + i * SLOT) % (24 * 60) // modulo 24h to get display times
    );

    const VALID_BADGES = ["Major", "General", "Math", "Science"];

    const PALETTES = [
      { id:"blue",     name:"Blue",     bg:"#e3f2fd", border:"#2196f3", text:"#0d47a1" },
      { id:"indigo",   name:"Indigo",   bg:"#e0e7ff", border:"#6366f1", text:"#3730a3" },
      { id:"sky",      name:"Sky",      bg:"#e0f2fe", border:"#0ea5e9", text:"#075985" },
      { id:"cyan",     name:"Cyan",     bg:"#e0f7fa", border:"#00bcd4", text:"#006064" },
      { id:"teal",     name:"Teal",     bg:"#e0f2f1", border:"#009688", text:"#004d40" },
      { id:"mint",     name:"Mint",     bg:"#e6fffa", border:"#2dd4bf", text:"#115e59" },
      { id:"green",    name:"Green",    bg:"#e8f5e9", border:"#4caf50", text:"#1b5e20" },
      { id:"emerald",  name:"Emerald",  bg:"#d1fae5", border:"#10b981", text:"#065f46" },
      { id:"lime",     name:"Lime",     bg:"#ecfccb", border:"#84cc16", text:"#3f6212" },
      { id:"yellow",   name:"Yellow",   bg:"#fef9c3", border:"#eab308", text:"#854d0e" },
      { id:"amber",    name:"Amber",    bg:"#fffde7", border:"#fbc02d", text:"#f57f17" },
      { id:"orange",   name:"Orange",   bg:"#fff4e5", border:"#ff9800", text:"#e65100" },
      { id:"coral",    name:"Coral",    bg:"#ffedd5", border:"#f97316", text:"#9a3412" },
      { id:"peach",    name:"Peach",    bg:"#fff0e6", border:"#ff8a65", text:"#bf360c" },
      { id:"red",      name:"Red",      bg:"#ffebee", border:"#f44336", text:"#b71c1c" },
      { id:"rose",     name:"Rose",     bg:"#ffe4e6", border:"#f43f5e", text:"#9f1239" },
      { id:"pink",     name:"Pink",     bg:"#fce7f3", border:"#ec4899", text:"#9d174d" },
      { id:"fuchsia",  name:"Fuchsia",  bg:"#fae8ff", border:"#d946ef", text:"#86198f" },
      { id:"purple",   name:"Purple",   bg:"#f3e5f5", border:"#9c27b0", text:"#4a148c" },
      { id:"violet",   name:"Violet",   bg:"#ede9fe", border:"#8b5cf6", text:"#5b21b6" },
      { id:"lavender", name:"Lavender", bg:"#f3f0ff", border:"#a855f7", text:"#6b21a8" },
      { id:"brown",    name:"Brown",    bg:"#f5ebe0", border:"#8d6e63", text:"#4e342e" },
      { id:"gray",     name:"Gray",     bg:"#f3f4f6", border:"#9ca3af", text:"#374151" },
      { id:"slate",    name:"Slate",    bg:"#f1f5f9", border:"#64748b", text:"#1e293b" },
    ];

    const STORAGE_KEY = "scheduleMaker.profiles.v1";
    const ACTIVE_KEY  = "scheduleMaker.activeProfile.v1";
    const PREFS_KEY   = "scheduleMaker.prefs.v1"; // global prefs like time format
    const STORAGE_EXAMS_KEY = "scheduleMaker.exams.v1";

    let exams = [];
    let activeMainTab = "schedule";

    const SUPABASE_URL = "https://wjvaqdldinuqwcnrkdby.supabase.co";
    // Verified anon/public key (decoded `ref` matches SUPABASE_URL exactly, valid to 2036).
    // Using the legacy JWT anon key because it is universally accepted by supabase-js v2;
    // the newer `sb_publishable_*` key's project segment did not match this project's ref.
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqdmFxZGxkaW51cXdjbnJrZGJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNzQyNzEsImV4cCI6MjA5OTY1MDI3MX0.gJnuujDiwXzHAenCcfq12Q6D3iaXNDPpyyCeP4iaBmw";
    const TABLE_NAME = "schedule_sync";

    const REVISION_KEY = "scheduleMaker.lastKnownRevision.v1";
    const PENDING_KEY = "scheduleMaker.hasPendingChanges.v1";

    let supabaseClient = null;
    let currentUser = null;
    let lastKnownRevision = parseInt(localStorage.getItem(REVISION_KEY) || "0", 10);
    let hasPendingChanges = localStorage.getItem(PENDING_KEY) === "true";
    let currentSyncStatus = "Saved locally";
    let syncDebounceTimer = null;
    let pendingConflictRemoteRow = null;

    function pad(n){ return String(n).padStart(2,"0"); }
    function toMinutes(str){ const [h,m] = str.split(":").map(Number); return h*60+m; }
    function minutesToHHMM(mins){ const h=Math.floor(mins/60), m=mins%60; return pad(h)+":"+pad(m); }
    function formatTime(mins, use24){
      if(use24) return minutesToHHMM(mins);
      let h = Math.floor(mins/60);
      const m = mins%60;
      const ampm = h>=12 ? "PM":"AM";
      h = (h%12)||12;
      return `${h}:${pad(m)} ${ampm}`;
    }

    function genId(){ return Math.random().toString(36).slice(2,10); }

    function escapeHtml(str) {
      if (str === null || str === undefined) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    // --------- Dark Mode ---------
    function applyDarkMode(){
      document.documentElement.classList.toggle("dark", !!prefs.darkMode);
      darkModeToggle.checked = !!prefs.darkMode;
    }

    // --------- State ---------
    let profiles = {};    // {id: {id, name, classes:[...]} }
    let activeProfileId = null;
    let prefs = { time24: false, darkMode: false, showWeekends: false };

    // Preload default "Computer Engineering" profile from the provided schedule
    function defaultProfiles(){
      const ce = {
        id: genId(),
        name: "Computer Engineering",
        classes: [
          // day: 1=Mon..7=Sun
          { id:genId(), day:1, start:"09:30", end:"12:30", code:"LNG321 S2",   subtitle:"English for Engineering", location:"CB1301",            instructor:"RACHANEE",         color:{type:"palette", id:"orange"}, badge:"General" },
          { id:genId(), day:2, start:"08:30", end:"10:00", code:"MTH234 S31",  subtitle:"Differential Equations", location:"CB2505",            instructor:"Songpon",          color:{type:"palette", id:"green"},  badge:"Math" },
          { id:genId(), day:2, start:"10:30", end:"12:30", code:"PHY10401 S31",subtitle:"Physics for Engineers",   location:"SC2110",            instructor:"Tanapat, Thana",   color:{type:"palette", id:"purple"}, badge:"Science" },
          { id:genId(), day:2, start:"13:30", end:"17:30", code:"CPE231 S31",  subtitle:"Big Data Engineering",   location:"CPE1121",           instructor:"Peerapon",         color:{type:"palette", id:"blue"},   badge:"Major" },
          { id:genId(), day:3, start:"10:30", end:"12:30", code:"GEN101 S40",  subtitle:"Physical Education",     location:"GYM (KFC 3rd Floor)",instructor:"Nanthanan",        color:{type:"palette", id:"red"},    badge:"General" },
          { id:genId(), day:3, start:"13:30", end:"16:30", code:"GEN231 S35",  subtitle:"Digital Literacy",       location:"ONLINE",            instructor:"Suthidee",         color:{type:"palette", id:"teal"},   badge:"General" },
          { id:genId(), day:4, start:"08:30", end:"12:30", code:"CPE222 S32",  subtitle:"Computer Organization",  location:"LIB108",            instructor:"Suthatip, Pongsagon", color:{type:"palette", id:"amber"}, badge:"Major" },
          { id:genId(), day:5, start:"08:30", end:"10:00", code:"MTH234 S31",  subtitle:"Differential Equations", location:"CB2505",            instructor:"Songpon",          color:{type:"palette", id:"green"},  badge:"Math" },
          { id:genId(), day:5, start:"11:30", end:"12:30", code:"PHY10401 S31",subtitle:"Physics for Engineers",   location:"SC2110",            instructor:"Tanapat, Thana",   color:{type:"palette", id:"purple"}, badge:"Science" },
        ]
      };
      const blank = { id: genId(), name:"Blank", classes: [] };
      // Prefer showing Blank first
      return { [blank.id]: blank, [ce.id]: ce };
    }

    // --------- Storage ---------
    function load(){
      try{
        profiles = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        activeProfileId = localStorage.getItem(ACTIVE_KEY);
        prefs = JSON.parse(localStorage.getItem(PREFS_KEY)) || { time24: false, darkMode: false, showWeekends: false };
        if(prefs.time24 === undefined) prefs.time24 = false;
        if(prefs.darkMode === undefined) prefs.darkMode = false;
        if(prefs.showWeekends === undefined) prefs.showWeekends = false;
      }catch{ profiles={}; activeProfileId=null; prefs={ time24:false, darkMode:false, showWeekends:false }; }
      if(Object.keys(profiles).length===0){
        profiles = defaultProfiles();
        const first = Object.values(profiles).find(p=>p.name==="Blank") || Object.values(profiles)[0];
        activeProfileId = first.id;
        save();
      } else {
        const BADGES_MIGRATED_KEY = "scheduleMaker.badgesMigrated.v1";
        if (!localStorage.getItem(BADGES_MIGRATED_KEY)) {
          // One-time upgrade for initial preloaded CE classes if they lack badges
          const defaultBadgesByCode = {
            "LNG": "General",
            "GEN": "General",
            "MTH": "Math",
            "PHY": "Science",
            "CPE": "Major"
          };
          let updated = false;
          Object.values(profiles).forEach(p => {
            if (p && Array.isArray(p.classes)) {
              p.classes.forEach(c => {
                if (!c.badge && p.name && p.name.includes("Computer Engineering")) {
                  for (const [prefix, badgeName] of Object.entries(defaultBadgesByCode)) {
                    if (c.code && c.code.toUpperCase().includes(prefix)) {
                      c.badge = badgeName;
                      updated = true;
                      break;
                    }
                  }
                }
              });
            }
          });
          if (updated) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
          }
          localStorage.setItem(BADGES_MIGRATED_KEY, "true");
        }
      }
      if(!profiles[activeProfileId]){
        activeProfileId = Object.keys(profiles)[0];
      }
      loadExams();
    }
    function save(){
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
      localStorage.setItem(ACTIVE_KEY, activeProfileId);
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

      hasPendingChanges = true;
      localStorage.setItem(PENDING_KEY, "true");

      if (!currentUser) {
        updateSyncStatusUI(navigator.onLine ? "Saved locally" : "Offline");
      } else {
        if (!navigator.onLine) {
          updateSyncStatusUI("Offline");
        } else {
          updateSyncStatusUI("Syncing…");
          debounceSync();
        }
      }
    }

    // --------- UI Elements ---------
    const profileSelect = document.getElementById("profileSelect");
    const newProfileBtn = document.getElementById("newProfileBtn");
    const renameProfileBtn = document.getElementById("renameProfileBtn");
    const duplicateProfileBtn = document.getElementById("duplicateProfileBtn");
    const deleteProfileBtn = document.getElementById("deleteProfileBtn");
    const addClassBtn = document.getElementById("addClassBtn");
    const badgeFilterSelect = document.getElementById("badgeFilterSelect");
    const timeFormatToggle = document.getElementById("timeFormatToggle");
    const weekendToggle = document.getElementById("weekendToggle");
    const darkModeToggle = document.getElementById("darkModeToggle");
    const importBtn = document.getElementById("importBtn");
    const exportBtn = document.getElementById("exportBtn");
    const importFile = document.getElementById("importFile");
    const installBtn = document.getElementById("installBtn");
    const shortcutsBtn = document.getElementById("shortcutsBtn");
    const shortcutsModal = document.getElementById("shortcutsModal");
    const closeShortcutsBtn = document.getElementById("closeShortcutsBtn");
    const toastEl = document.getElementById("toast");
    const gridEl = document.getElementById("grid");
    const agendaEl = document.getElementById("agenda");
    const tabBtns = document.querySelectorAll(".tabBtn");

    const syncStatusBadge = document.getElementById("syncStatusBadge");
    const accountBtn = document.getElementById("accountBtn");
    const accountModal = document.getElementById("accountModal");
    const closeAccountBtn = document.getElementById("closeAccountBtn");
    const authSignedOutView = document.getElementById("authSignedOutView");
    const authSignedInView = document.getElementById("authSignedInView");
    const authEmailInput = document.getElementById("authEmailInput");
    const sendMagicLinkBtn = document.getElementById("sendMagicLinkBtn");
    const authMsg = document.getElementById("authMsg");
    const authUserEmail = document.getElementById("authUserEmail");
    const modalSyncStatus = document.getElementById("modalSyncStatus");
    const manualSyncBtn = document.getElementById("manualSyncBtn");
    const signOutBtn = document.getElementById("signOutBtn");

    const conflictModal = document.getElementById("conflictModal");
    const choiceUploadLocalBtn = document.getElementById("choiceUploadLocalBtn");
    const choiceUseCloudBtn = document.getElementById("choiceUseCloudBtn");
    const choiceMergeBtn = document.getElementById("choiceMergeBtn");

    // Main Tabs & Content
    const tabScheduleBtn = document.getElementById("tabScheduleBtn");
    const tabExamsBtn = document.getElementById("tabExamsBtn");
    const scheduleTabContent = document.getElementById("scheduleTabContent");
    const examsTabContent = document.getElementById("examsTabContent");
    const scheduleControls = document.getElementById("scheduleControls");
    const examCountBadge = document.getElementById("examCountBadge");

    // Exam Tracker Elements
    const examsSummaryText = document.getElementById("examsSummaryText");
    const openExamImportBtn = document.getElementById("openExamImportBtn");
    const clearExamsBtn = document.getElementById("clearExamsBtn");
    const examTimeFormatToggle = document.getElementById("examTimeFormatToggle");
    const nextExamBanner = document.getElementById("nextExamBanner");
    const examsList = document.getElementById("examsList");
    const examsEmptyState = document.getElementById("examsEmptyState");
    const emptyImportBtn = document.getElementById("emptyImportBtn");
    const loadSampleExamsBtn = document.getElementById("loadSampleExamsBtn");

    // Exam Import Modal
    const examImportModal = document.getElementById("examImportModal");
    const rawExamText = document.getElementById("rawExamText");
    const insertSampleRawBtn = document.getElementById("insertSampleRawBtn");
    const cancelExamImportBtn = document.getElementById("cancelExamImportBtn");
    const parseExamBtn = document.getElementById("parseExamBtn");

    // Cheatsheet Modal
    const cheatsheetModal = document.getElementById("cheatsheetModal");
    const cheatsheetModalTitle = document.getElementById("cheatsheetModalTitle");
    const cheatsheetModalSubtitle = document.getElementById("cheatsheetModalSubtitle");
    const cheatsheetExamId = document.getElementById("cheatsheetExamId");
    const cheatsheetCustomNote = document.getElementById("cheatsheetCustomNote");
    const cancelCheatsheetBtn = document.getElementById("cancelCheatsheetBtn");
    const saveCheatsheetBtn = document.getElementById("saveCheatsheetBtn");
    let editingCheatsheetExamId = null;
    let selectedCheatsheetStatus = "unset";
    let selectedCheatsheetNote = "";

    // Calculator Modal
    const calculatorModal = document.getElementById("calculatorModal");
    const calculatorModalTitle = document.getElementById("calculatorModalTitle");
    const calculatorModalSubtitle = document.getElementById("calculatorModalSubtitle");
    const calculatorExamId = document.getElementById("calculatorExamId");
    const calculatorCustomNote = document.getElementById("calculatorCustomNote");
    const cancelCalculatorBtn = document.getElementById("cancelCalculatorBtn");
    const saveCalculatorBtn = document.getElementById("saveCalculatorBtn");
    let editingCalculatorExamId = null;
    let selectedCalculatorStatus = "unset";
    let selectedCalculatorNote = "";

    // Modal
    const modal = document.getElementById("classModal");
    const backdrop = modal.querySelector(".backdrop");
    const modalTitle = document.getElementById("classModalTitle");
    const classIdInput = document.getElementById("classId");
    const dayInput = document.getElementById("classDay");
    const startInput = document.getElementById("classStart");
    const endInput = document.getElementById("classEnd");
    const codeInput = document.getElementById("classCode");
    const subtitleInput = document.getElementById("classSubtitle");
    const locationInput = document.getElementById("classLocation");
    const instructorInput = document.getElementById("classInstructor");
    const classBadgeInput = document.getElementById("classBadge");
    const badgePicker = document.getElementById("badgePicker");
    const paletteSwatches = document.getElementById("paletteSwatches");
    const customBg = document.getElementById("customBg");
    const customBorder = document.getElementById("customBorder");
    const customText = document.getElementById("customText");
    const colorTabs = document.querySelectorAll(".colorTab");
    const palettePanel = document.getElementById("palettePanel");
    const customPanel = document.getElementById("customPanel");
    const saveClassBtn = document.getElementById("saveClassBtn");
    const cancelClassBtn = document.getElementById("cancelClassBtn");
    const deleteClassBtn = document.getElementById("deleteClassBtn");

    let editingClass = null; // object reference in current profile
    let activeBadgeFilter = "all";
    let colorChoice = { type:"palette", id:"blue" };
    let draggedClassId = null;
    let deferredInstallPrompt = null;
    let toastTimer = null;

    function showToast(message){
      toastEl.textContent = message;
      toastEl.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(()=>toastEl.classList.remove("show"), 2600);
    }

    function openShortcuts(){
      shortcutsModal.classList.add("show");
      shortcutsModal.setAttribute("aria-hidden", "false");
      closeShortcutsBtn.focus();
    }
    function closeShortcuts(){
      shortcutsModal.classList.remove("show");
      shortcutsModal.setAttribute("aria-hidden", "true");
    }

    // --------- Sync & Account Functions ---------
    function openAccountModal() {
      accountModal.classList.add("show");
      accountModal.setAttribute("aria-hidden", "false");
    }

    function closeAccountModal() {
      accountModal.classList.remove("show");
      accountModal.setAttribute("aria-hidden", "true");
    }

    function openConflictModal() {
      conflictModal.classList.add("show");
      conflictModal.setAttribute("aria-hidden", "false");
    }

    function closeConflictModal() {
      conflictModal.classList.remove("show");
      conflictModal.setAttribute("aria-hidden", "true");
      pendingConflictRemoteRow = null;
    }

    function showAuthMsg(text, type = "info") {
      if (!authMsg) return;
      authMsg.textContent = text;
      authMsg.className = `auth-msg ${type}`;
      authMsg.style.display = text ? "block" : "none";
    }

    function updateSyncStatusUI(status) {
      currentSyncStatus = status;
      [syncStatusBadge, modalSyncStatus].forEach(badge => {
        if (!badge) return;
        badge.textContent = status;
        badge.className = "sync-status";
        if (status === "Synced") {
          badge.classList.add("status-synced");
        } else if (status === "Syncing…") {
          badge.classList.add("status-syncing");
        } else if (status === "Saved locally") {
          badge.classList.add("status-saved-locally");
        } else if (status === "Offline") {
          badge.classList.add("status-offline");
        }
      });
    }

    function updateAuthUI() {
      if (currentUser) {
        accountBtn.textContent = currentUser.email ? currentUser.email.split("@")[0] : "Account";
        accountBtn.title = `Signed in as ${currentUser.email}`;
        if (authSignedOutView) authSignedOutView.style.display = "none";
        if (authSignedInView) authSignedInView.style.display = "block";
        if (authUserEmail) authUserEmail.textContent = currentUser.email;
      } else {
        accountBtn.textContent = "Sign in";
        accountBtn.title = "Sign in / Sync";
        if (authSignedOutView) authSignedOutView.style.display = "block";
        if (authSignedInView) authSignedInView.style.display = "none";
        if (authUserEmail) authUserEmail.textContent = "";
      }
    }

    function getLocalScheduleData() {
      return {
        profiles: profiles,
        activeProfileId: activeProfileId,
        preferences: prefs,
        exams: exams
      };
    }

    function applyCloudData(cloudData) {
      if (!cloudData) return;
      if (cloudData.profiles && typeof cloudData.profiles === "object" && Object.keys(cloudData.profiles).length > 0) {
        profiles = cloudData.profiles;
      }
      if (cloudData.activeProfileId && profiles[cloudData.activeProfileId]) {
        activeProfileId = cloudData.activeProfileId;
      } else if (Object.keys(profiles).length > 0) {
        activeProfileId = Object.keys(profiles)[0];
      }
      if (cloudData.preferences && typeof cloudData.preferences === "object") {
        prefs = { ...prefs, ...cloudData.preferences };
      }
      if (Array.isArray(cloudData.exams)) {
        exams = cloudData.exams;
        localStorage.setItem(STORAGE_EXAMS_KEY, JSON.stringify(exams));
        renderExams();
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
      localStorage.setItem(ACTIVE_KEY, activeProfileId);
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      render();
    }

    function mergeScheduleData(localData, remoteData) {
      if (!remoteData || !remoteData.profiles) return localData;
      if (!localData || !localData.profiles) return remoteData;

      const mergedProfiles = {};

      // Copy remote profiles
      for (const [id, prof] of Object.entries(remoteData.profiles)) {
        mergedProfiles[id] = JSON.parse(JSON.stringify(prof));
      }

      // Merge local profiles
      for (const [id, localProf] of Object.entries(localData.profiles)) {
        if (mergedProfiles[id]) {
          const existingClasses = mergedProfiles[id].classes || [];
          const localClasses = localProf.classes || [];
          const classMap = new Map();

          for (const c of existingClasses) {
            const key = c.id || `${c.code}_${c.day}_${c.start}`;
            classMap.set(key, c);
          }
          for (const c of localClasses) {
            const key = c.id || `${c.code}_${c.day}_${c.start}`;
            if (!classMap.has(key)) {
              classMap.set(key, c);
            }
          }
          mergedProfiles[id].classes = Array.from(classMap.values());
        } else {
          const matchingByName = Object.values(mergedProfiles).find(
            p => (p.name || "").trim().toLowerCase() === (localProf.name || "").trim().toLowerCase()
          );
          if (matchingByName) {
            const existingClasses = matchingByName.classes || [];
            const localClasses = localProf.classes || [];
            const classMap = new Map();

            for (const c of existingClasses) {
              const key = c.id || `${c.code}_${c.day}_${c.start}`;
              classMap.set(key, c);
            }
            for (const c of localClasses) {
              const key = c.id || `${c.code}_${c.day}_${c.start}`;
              if (!classMap.has(key)) {
                classMap.set(key, c);
              }
            }
            matchingByName.classes = Array.from(classMap.values());
          } else {
            mergedProfiles[id] = JSON.parse(JSON.stringify(localProf));
          }
        }
      }

      const mergedActiveId =
        (localData.activeProfileId && mergedProfiles[localData.activeProfileId])
          ? localData.activeProfileId
          : ((remoteData.activeProfileId && mergedProfiles[remoteData.activeProfileId])
              ? remoteData.activeProfileId
              : Object.keys(mergedProfiles)[0]);

      const mergedPrefs = {
        ...(remoteData.preferences || {}),
        ...(localData.preferences || {})
      };

      // Merge exams
      const remoteExams = Array.isArray(remoteData.exams) ? remoteData.exams : [];
      const localExams = Array.isArray(localData.exams) ? localData.exams : [];
      const examMap = new Map();
      for (const e of remoteExams) {
        const key = e.id || `${e.code}_${e.rawDate}_${e.time}`;
        examMap.set(key, e);
      }
      for (const e of localExams) {
        const key = e.id || `${e.code}_${e.rawDate}_${e.time}`;
        if (!examMap.has(key)) examMap.set(key, e);
      }
      const mergedExams = Array.from(examMap.values());

      return {
        profiles: mergedProfiles,
        activeProfileId: mergedActiveId,
        preferences: mergedPrefs,
        exams: mergedExams
      };
    }

    function isDataDifferent(a, b) {
      if (!a || !b) return true;
      return JSON.stringify(a) !== JSON.stringify(b);
    }

    function debounceSync() {
      clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => {
        syncWithCloud();
      }, 500);
    }

    async function syncWithCloud(forceMode = null) {
      if (!supabaseClient || !currentUser) {
        updateSyncStatusUI(navigator.onLine ? "Saved locally" : "Offline");
        return;
      }

      if (!navigator.onLine) {
        updateSyncStatusUI("Offline");
        return;
      }

      updateSyncStatusUI("Syncing…");

      try {
        const { data: rows, error: fetchErr } = await supabaseClient
          .from(TABLE_NAME)
          .select("*")
          .eq("user_id", currentUser.id);

        if (fetchErr) {
          console.warn("Fetch error from Supabase:", fetchErr);
          updateSyncStatusUI("Saved locally");
          return;
        }

        const remoteRow = rows && rows.length > 0 ? rows[0] : null;
        const now = new Date().toISOString();
        const currentLocalData = getLocalScheduleData();

        if (!remoteRow) {
          // First upload to cloud
          const initialRevision = 1;
          const { error: insertErr } = await supabaseClient
            .from(TABLE_NAME)
            .upsert({
              user_id: currentUser.id,
              data: currentLocalData,
              revision: initialRevision,
              updated_at: now
            });

          if (insertErr) {
            console.warn("Insert error:", insertErr);
            updateSyncStatusUI("Saved locally");
            return;
          }

          lastKnownRevision = initialRevision;
          localStorage.setItem(REVISION_KEY, String(initialRevision));
          hasPendingChanges = false;
          localStorage.setItem(PENDING_KEY, "false");
          updateSyncStatusUI("Synced");
          return;
        }

        const remoteRevision = Number(remoteRow.revision) || 1;
        const remoteData = remoteRow.data;

        if (forceMode === "upload") {
          const nextRev = Math.max(lastKnownRevision, remoteRevision) + 1;
          const { error: upsertErr } = await supabaseClient
            .from(TABLE_NAME)
            .upsert({
              user_id: currentUser.id,
              data: currentLocalData,
              revision: nextRev,
              updated_at: now
            });

          if (!upsertErr) {
            lastKnownRevision = nextRev;
            localStorage.setItem(REVISION_KEY, String(nextRev));
            hasPendingChanges = false;
            localStorage.setItem(PENDING_KEY, "false");
            updateSyncStatusUI("Synced");
            showToast("Uploaded local schedules to cloud");
          } else {
            updateSyncStatusUI("Saved locally");
          }
          closeConflictModal();
          return;
        }

        if (forceMode === "use_cloud") {
          applyCloudData(remoteData);
          lastKnownRevision = remoteRevision;
          localStorage.setItem(REVISION_KEY, String(remoteRevision));
          hasPendingChanges = false;
          localStorage.setItem(PENDING_KEY, "false");
          updateSyncStatusUI("Synced");
          showToast("Applied schedules from cloud");
          closeConflictModal();
          return;
        }

        if (forceMode === "merge") {
          const mergedData = mergeScheduleData(currentLocalData, remoteData);
          applyCloudData(mergedData);
          const nextRev = Math.max(lastKnownRevision, remoteRevision) + 1;

          const { error: upsertErr } = await supabaseClient
            .from(TABLE_NAME)
            .upsert({
              user_id: currentUser.id,
              data: mergedData,
              revision: nextRev,
              updated_at: now
            });

          if (!upsertErr) {
            lastKnownRevision = nextRev;
            localStorage.setItem(REVISION_KEY, String(nextRev));
            hasPendingChanges = false;
            localStorage.setItem(PENDING_KEY, "false");
            updateSyncStatusUI("Synced");
            showToast("Merged local and cloud schedules");
          } else {
            updateSyncStatusUI("Saved locally");
          }
          closeConflictModal();
          return;
        }

        // Auto-sync checks
        if (remoteRevision > lastKnownRevision && isDataDifferent(currentLocalData, remoteData)) {
          pendingConflictRemoteRow = remoteRow;
          openConflictModal();
          return;
        }

        if (hasPendingChanges) {
          const nextRev = Math.max(lastKnownRevision, remoteRevision) + 1;
          const { error: upsertErr } = await supabaseClient
            .from(TABLE_NAME)
            .upsert({
              user_id: currentUser.id,
              data: currentLocalData,
              revision: nextRev,
              updated_at: now
            });

          if (!upsertErr) {
            lastKnownRevision = nextRev;
            localStorage.setItem(REVISION_KEY, String(nextRev));
            hasPendingChanges = false;
            localStorage.setItem(PENDING_KEY, "false");
            updateSyncStatusUI("Synced");
          } else {
            updateSyncStatusUI("Saved locally");
          }
        } else {
          if (remoteRevision > lastKnownRevision) {
            applyCloudData(remoteData);
            lastKnownRevision = remoteRevision;
            localStorage.setItem(REVISION_KEY, String(remoteRevision));
          }
          updateSyncStatusUI("Synced");
        }

      } catch (err) {
        console.warn("Sync error:", err);
        updateSyncStatusUI(navigator.onLine ? "Saved locally" : "Offline");
      }
    }

    async function sendMagicLink() {
      const email = (authEmailInput.value || "").trim();
      if (!email || !email.includes("@")) {
        showAuthMsg("Please enter a valid email address.", "error");
        return;
      }

      if (!supabaseClient) {
        showAuthMsg("Sign-in service is unavailable. Check your connection and reload the page.", "error");
        return;
      }

      showAuthMsg("Sending magic link...", "info");

      try {
        const { error } = await supabaseClient.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: window.location.href.split('#')[0]
          }
        });

        if (error) {
          showAuthMsg(`Error: ${error.message}`, "error");
        } else {
          showAuthMsg("Check your email for the magic link!", "success");
          authEmailInput.value = "";
        }
      } catch (err) {
        showAuthMsg(`Failed to send link: ${err.message}`, "error");
      }
    }

    async function handleSignOut() {
      if (supabaseClient) {
        await supabaseClient.auth.signOut();
      }
      currentUser = null;
      lastKnownRevision = 0;
      localStorage.removeItem(REVISION_KEY);
      hasPendingChanges = false;
      localStorage.setItem(PENDING_KEY, "false");
      updateAuthUI();
      updateSyncStatusUI(navigator.onLine ? "Saved locally" : "Offline");
      showToast("Signed out");
    }

    function initSupabase() {
      try {
        if (window.supabase && typeof window.supabase.createClient === "function") {
          supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
          supabaseClient.auth.onAuthStateChange(async (event, session) => {
            currentUser = session?.user || null;
            updateAuthUI();
            if (currentUser) {
              syncWithCloud();
            } else {
              updateSyncStatusUI(navigator.onLine ? "Saved locally" : "Offline");
            }
          });
        } else {
          updateSyncStatusUI(navigator.onLine ? "Saved locally" : "Offline");
        }
      } catch (err) {
        // Never let a Supabase init failure break the rest of the app UI
        // (e.g. the Sign in button wiring that runs right after this).
        console.warn("Supabase init failed; sync disabled:", err);
        supabaseClient = null;
        updateSyncStatusUI(navigator.onLine ? "Saved locally" : "Offline");
      }
    }

    // --------- Initialization ---------
    function visibleDays(){
      return DAYS
        .map((name, index)=>({ name, value:index+1 }))
        .filter(day=> prefs.showWeekends || day.value <= WEEKDAY_COUNT);
    }

    function initDayOptions(selectedDay=dayInput.value){
      const selected = Number(selectedDay) || 1;
      dayInput.innerHTML = "";
      visibleDays().forEach(day=>{
        const opt = document.createElement("option");
        opt.value = String(day.value);
        opt.textContent = day.name;
        dayInput.appendChild(opt);
      });

      if([...dayInput.options].some(opt=>Number(opt.value)===selected)){
        dayInput.value = String(selected);
      }else{
        dayInput.value = "1";
      }
    }

    function initTimeOptions(){
      startInput.innerHTML = "";
      endInput.innerHTML = "";
      const use24 = prefs.time24;
      // generate options only for valid 30-minute ticks
      for(let i=0;i<SLOTS.length;i++){
        const t = SLOTS[i];
        const label = formatTime(t, use24);
        const opt1 = document.createElement("option");
        opt1.value = minutesToHHMM(t);
        opt1.textContent = label;
        startInput.appendChild(opt1);
        // end options reuse same list; clone
        const opt2 = document.createElement("option");
        opt2.value = minutesToHHMM(t);
        opt2.textContent = label;
        endInput.appendChild(opt2);
      }
    }

    function renderProfileSelect(){
      profileSelect.innerHTML = "";
      Object.values(profiles).sort((a,b)=>a.name.localeCompare(b.name)).forEach(p=>{
        const opt=document.createElement("option");
        opt.value=p.id; opt.textContent=p.name;
        profileSelect.appendChild(opt);
      });
      profileSelect.value = activeProfileId;
    }

    function paletteById(id){ return PALETTES.find(p=>p.id===id) || PALETTES[0]; }

    function classStyle(color){
      if(color?.type==="custom"){
        return `--cbg:${color.bg};--cbor:${color.border};--ctx:${color.text};`;
      }
      const pal = paletteById(color?.id);
      return `--cbg:${pal.bg};--cbor:${pal.border};--ctx:${pal.text};`;
    }

    function beginDrag(event, cls){
      draggedClassId = cls.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", cls.id);
      requestAnimationFrame(()=>event.currentTarget.classList.add("dragging"));
    }

    function endDrag(event){
      event.currentTarget.classList.remove("dragging");
      document.querySelectorAll(".drop-target").forEach(el=>el.classList.remove("drop-target"));
      draggedClassId = null;
    }

    function moveClass(classId, newDay, newStart=null){
      const profile = profiles[activeProfileId];
      const cls = profile?.classes.find(item=>item.id===classId);
      if(!cls) return;
      cls.day = Number(newDay);
      if(newStart){
        const duration = toMinutes(cls.end) - toMinutes(cls.start);
        let start = toMinutes(newStart);
        start = Math.max(START_MIN, Math.min(start, END_MIN - duration));
        cls.start = minutesToHHMM(start);
        cls.end = minutesToHHMM(start + duration);
      }
      save();
      render();
      showToast(`${cls.code} moved to ${DAYS[cls.day-1]}`);
    }

    function makeDropTarget(element, day, start=null){
      element.dataset.day = String(day);
      if(start) element.dataset.start = start;
      element.addEventListener("dragover", event=>{
        if(!draggedClassId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        element.classList.add("drop-target");
      });
      element.addEventListener("dragleave", ()=>element.classList.remove("drop-target"));
      element.addEventListener("drop", event=>{
        event.preventDefault();
        element.classList.remove("drop-target");
        const id = draggedClassId || event.dataTransfer.getData("text/plain");
        if(id) moveClass(id, day, start);
      });
    }

    function isClassCurrent(cls){
      if(!cls || !cls.start || !cls.end) return false;
      const now = new Date();
      const jsDay = now.getDay();
      const currentDay = jsDay === 0 ? 7 : jsDay;
      if(Number(cls.day) !== currentDay) return false;
      const currentMins = now.getHours() * 60 + now.getMinutes();
      const startMins = toMinutes(cls.start);
      const endMins = toMinutes(cls.end);
      if(!Number.isFinite(startMins) || !Number.isFinite(endMins)) return false;
      return currentMins >= startMins && currentMins < endMins;
    }

    function updateCurrentClassHighlight(){
      const prof = profiles[activeProfileId];
      if(!prof) return;

      const currentIds = new Set(prof.classes.filter(isClassCurrent).map(c=>c.id));

      // Update grid blocks
      gridEl.querySelectorAll(".class-block").forEach(block=>{
        const id = block.dataset.id;
        const shouldBeCurrent = currentIds.has(id);
        const isNow = block.classList.contains("is-current");
        if(shouldBeCurrent !== isNow){
          block.classList.toggle("is-current", shouldBeCurrent);
          const badgeWrap = block.querySelector(".class-badges-wrap") || block.querySelector(".class-code-row");
          const existingBadge = block.querySelector(".current-badge");
          if(shouldBeCurrent && !existingBadge && badgeWrap){
            const badge = document.createElement("span");
            badge.className = "current-badge";
            badge.innerHTML = '<span class="pulse-dot"></span>NOW';
            badgeWrap.appendChild(badge);
          } else if(!shouldBeCurrent && existingBadge){
            existingBadge.remove();
          }
        }
      });

      // Update agenda items
      agendaEl.querySelectorAll(".agenda-item").forEach(item=>{
        const id = item.dataset.id;
        const shouldBeCurrent = currentIds.has(id);
        const isNow = item.classList.contains("is-current");
        if(shouldBeCurrent !== isNow){
          item.classList.toggle("is-current", shouldBeCurrent);
          const badgeWrap = item.querySelector(".agenda-badges-wrap") || item.querySelector(".agenda-code-row");
          const existingBadge = item.querySelector(".current-badge");
          if(shouldBeCurrent && !existingBadge && badgeWrap){
            const badge = document.createElement("span");
            badge.className = "current-badge";
            badge.innerHTML = '<span class="pulse-dot"></span>NOW';
            badgeWrap.appendChild(badge);
          } else if(!shouldBeCurrent && existingBadge){
            existingBadge.remove();
          }
        }
      });
    }

    function buildGrid(){
      gridEl.innerHTML = "";
      const days = visibleDays();
      gridEl.style.gridTemplateRows = `48px repeat(${days.length}, 120px)`;
      // Corner
      const corner = document.createElement("div");
      corner.className="corner";
      gridEl.appendChild(corner);
      // Time headers
      for(let i=0;i<SLOTS.length;i++){
        const th = document.createElement("div");
        th.className="time-header";
        th.style.gridColumn = (i+2);
        th.textContent = formatTime(SLOTS[i], prefs.time24);
        gridEl.appendChild(th);
      }
      // Day labels + grid lines
      days.forEach((day, rowIndex)=>{
        const dl = document.createElement("div");
        dl.className="day-label";
        dl.style.gridRow = (rowIndex+2);
        dl.textContent = day.name;
        gridEl.appendChild(dl);

        for(let c=0; c<SLOTS.length; c++){
          const cell = document.createElement("div");
          cell.className="grid-cell";
          cell.style.gridRow = (rowIndex+2);
          cell.style.gridColumn = (c+2);
          makeDropTarget(cell, day.value, minutesToHHMM(SLOTS[c]));
          gridEl.appendChild(cell);
        }
      });

      // Class blocks
      const prof = profiles[activeProfileId];
      if(!prof) return;
      for(const cls of prof.classes){
        const dayIndex = days.findIndex(day=>day.value===cls.day);
        if(dayIndex === -1) continue;
        const r = dayIndex + 2; // row
        const start = toMinutes(cls.start);
        const end = toMinutes(cls.end);
        // Constrain to grid
        const sIdx = Math.max(0, Math.min(SLOTS.length-1, Math.round((start-START_MIN)/SLOT)));
        const eIdx = Math.max(0, Math.min(SLOTS.length, Math.round((end-START_MIN)/SLOT)));
        if(eIdx <= sIdx) continue;

        const isCurrent = isClassCurrent(cls);
        const isDimmed = (activeBadgeFilter !== "all" && cls.badge !== activeBadgeFilter);
        const block = document.createElement("div");
        block.className = "class-block" + (isCurrent ? " is-current" : "") + (isDimmed ? " dimmed" : "");
        block.style.gridRow = r;
        block.style.gridColumn = (sIdx+2) + " / " + (eIdx+2);
        block.style.cssText += classStyle(cls.color);
        block.dataset.id = cls.id;
        block.draggable = true;
        block.tabIndex = 0;
        block.setAttribute("role", "button");
        block.setAttribute("aria-label", `${cls.code}${cls.badge ? ` (${cls.badge})` : ""}${isCurrent ? " (Current class)" : ""}, ${DAYS[cls.day-1]}, ${cls.start} to ${cls.end}. Drag to move or press Enter to edit.`);
        block.addEventListener("dragstart", event=>beginDrag(event, cls));
        block.addEventListener("dragend", endDrag);
        block.addEventListener("keydown", event=>{
          if(event.key==="Enter" || event.key===" "){ event.preventDefault(); openClassModal(cls); }
        });

        const codeRow = document.createElement("div");
        codeRow.className = "class-code-row";

        const code = document.createElement("div");
        code.className="class-code";
        code.textContent = cls.code;
        codeRow.appendChild(code);

        const badgesWrap = document.createElement("div");
        badgesWrap.className = "class-badges-wrap";

        if(cls.badge){
          const catBadge = document.createElement("span");
          catBadge.className = `category-badge category-badge--${cls.badge.toLowerCase()}`;
          catBadge.textContent = cls.badge;
          badgesWrap.appendChild(catBadge);
        }

        if(isCurrent){
          const badge = document.createElement("span");
          badge.className = "current-badge";
          badge.innerHTML = '<span class="pulse-dot"></span>NOW';
          badgesWrap.appendChild(badge);
        }

        codeRow.appendChild(badgesWrap);

        const sub1 = document.createElement("div");
        sub1.className = "class-sub";
        sub1.style.cssText += classStyle(cls.color); // colorise location
        sub1.textContent = cls.location;

        const sub2 = document.createElement("div");
        sub2.className = "class-sub";
        sub2.style.cssText += classStyle(cls.color); // colorise professor
        sub2.textContent = cls.instructor;

        block.appendChild(codeRow);
        if (cls.subtitle) {
          const subTitle = document.createElement("div");
          subTitle.className = "class-subtitle";
          subTitle.title = cls.subtitle; // full text on hover if truncated
          subTitle.textContent = cls.subtitle;
          block.appendChild(subTitle);
        }
        block.appendChild(sub1);
        block.appendChild(sub2);

        block.addEventListener("click", ()=> openClassModal(cls));
        gridEl.appendChild(block);
      }
    }

    function buildAgenda(){
      agendaEl.innerHTML = "";
      const prof = profiles[activeProfileId];
      if(!prof) return;

      for(const day of visibleDays()){
        const items = prof.classes.filter(c=>c.day===day.value)
          .sort((a,b)=>toMinutes(a.start)-toMinutes(b.start));
        const dayWrap = document.createElement("div");
        dayWrap.className = "agenda-day";
        makeDropTarget(dayWrap, day.value);
        const heading = document.createElement("h3");
        heading.textContent = day.name;
        dayWrap.appendChild(heading);

        if(!items.length){
          const empty = document.createElement("div");
          empty.className = "agenda-empty";
          empty.textContent = "No classes. Drop one here.";
          dayWrap.appendChild(empty);
        }

        for(const cls of items){
          const isCurrent = isClassCurrent(cls);
          const isDimmed = (activeBadgeFilter !== "all" && cls.badge !== activeBadgeFilter);
          const row = document.createElement("div");
          row.className = "agenda-item" + (isCurrent ? " is-current" : "") + (isDimmed ? " dimmed" : "");
          row.style.cssText += classStyle(cls.color);
          row.dataset.id = cls.id;
          row.draggable = true;
          row.tabIndex = 0;
          row.setAttribute("role", "button");
          row.setAttribute("aria-label", `${cls.code}${cls.badge ? ` (${cls.badge})` : ""}${isCurrent ? " (Current class)" : ""}, ${day.name}, ${cls.start} to ${cls.end}. Drag to another day or press Enter to edit.`);
          row.addEventListener("dragstart", event=>beginDrag(event, cls));
          row.addEventListener("dragend", endDrag);
          row.addEventListener("click", ()=>openClassModal(cls));
          row.addEventListener("keydown", event=>{
            if(event.key==="Enter" || event.key===" "){ event.preventDefault(); openClassModal(cls); }
          });

          const time = document.createElement("div");
          time.className = "agenda-time";
          time.style.cssText += classStyle(cls.color);
          time.style.color = "var(--ctx)";
          time.style.borderLeft = "5px solid var(--cbor)";
          const start = document.createElement("div");
          const end = document.createElement("div");
          start.textContent = formatTime(toMinutes(cls.start), prefs.time24);
          end.textContent = formatTime(toMinutes(cls.end), prefs.time24);
          time.append(start, end);

          const content = document.createElement("div");
          content.className = "agenda-content";

          const codeRow = document.createElement("div");
          codeRow.className = "agenda-code-row";

          const code = document.createElement("div");
          code.className = "code";
          code.style.cssText = classStyle(cls.color) + "color:var(--ctx)";
          code.textContent = cls.code;
          codeRow.appendChild(code);

          const badgesWrap = document.createElement("div");
          badgesWrap.className = "agenda-badges-wrap";

          if(cls.badge){
            const catBadge = document.createElement("span");
            catBadge.className = `category-badge category-badge--${cls.badge.toLowerCase()}`;
            catBadge.textContent = cls.badge;
            badgesWrap.appendChild(catBadge);
          }

          if(isCurrent){
            const badge = document.createElement("span");
            badge.className = "current-badge";
            badge.innerHTML = '<span class="pulse-dot"></span>NOW';
            badgesWrap.appendChild(badge);
          }

          codeRow.appendChild(badgesWrap);

          let subtitleEl = null;
          if (cls.subtitle) {
            subtitleEl = document.createElement("div");
            subtitleEl.className = "subtitle";
            subtitleEl.style.cssText = classStyle(cls.color) + "color:var(--ctx)";
            subtitleEl.title = cls.subtitle;
            subtitleEl.textContent = cls.subtitle;
          }
          const meta = document.createElement("div");
          meta.className = "meta";
          for(const text of [cls.location, cls.instructor]){
            const span = document.createElement("span");
            span.style.cssText = classStyle(cls.color) + "color:var(--ctx)";
            span.textContent = text;
            meta.appendChild(span);
          }
          content.append(codeRow);
          if (subtitleEl) content.appendChild(subtitleEl);
          content.append(meta);
          row.append(time, content);
          dayWrap.appendChild(row);
        }
        agendaEl.appendChild(dayWrap);
      }
    }

    function render(){
      renderProfileSelect();
      timeFormatToggle.checked = !!prefs.time24;
      if (examTimeFormatToggle) examTimeFormatToggle.checked = !!prefs.time24;
      weekendToggle.checked = !!prefs.showWeekends;
      applyDarkMode();
      initDayOptions();
      initTimeOptions();
      buildGrid();
      buildAgenda();
      renderExams();
    }

    // --------- Modal Logic ---------
    function renderPaletteSwatches(){
      paletteSwatches.innerHTML = "";
      PALETTES.forEach(p=>{
        const el = document.createElement("div");
        el.className = "swatch";
        el.dataset.id = p.id;
        el.tabIndex = 0;
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", `${p.name} palette`);
        el.innerHTML = `
          <div class="preview" style="background:${p.bg};color:${p.border}"></div>
          <div class="swatch-name">${p.name}</div>
        `;
        const select = ()=>{
          colorChoice = { type:"palette", id:p.id };
          highlightActiveSwatch();
        };
        el.addEventListener("click", select);
        el.addEventListener("keydown", e=>{
          if(e.key==="Enter" || e.key===" "){ e.preventDefault(); select(); }
        });
        paletteSwatches.appendChild(el);
      });
      highlightActiveSwatch();
    }

    function highlightActiveSwatch(){
      if(!paletteSwatches) return;
      [...paletteSwatches.children].forEach(c=>{
        const isSelected = (c.dataset.id === colorChoice.id);
        c.style.outline = isSelected ? `2px solid var(--accent)` : "none";
        c.classList.toggle("selected", isSelected);
        c.setAttribute("aria-selected", isSelected ? "true" : "false");
      });
    }

    function setColorTab(tab){
      [...colorTabs].forEach(b=> b.classList.toggle("active", b.dataset.tab===tab));
      palettePanel.style.display = tab==="palettes" ? "block":"none";
      customPanel.style.display = tab==="custom" ? "block":"none";
    }

    function openClassModal(cls=null){
      editingClass = cls;
      modal.classList.add("show");
      modal.setAttribute("aria-hidden","false");
      modalTitle.textContent = cls ? "Edit class" : "Add class";
      deleteClassBtn.style.display = cls ? "inline-flex" : "none";

      // Prefill
      classIdInput.value = cls?.id || "";
      initDayOptions(cls?.day || 1);
      // Time defaults
      const defStart = "08:00";
      const defEnd = "09:00";
      startInput.value = cls?.start || defStart;
      endInput.value = cls?.end || defEnd;
      codeInput.value = cls?.code || "";
      subtitleInput.value = cls?.subtitle || "";
      locationInput.value = cls?.location || "";
      instructorInput.value = cls?.instructor || "";

      // Badge
      const currentBadge = cls?.badge || "";
      if(classBadgeInput) classBadgeInput.value = currentBadge;
      if(badgePicker){
        badgePicker.querySelectorAll(".badge-opt-btn").forEach(btn=>{
          const isSel = (btn.dataset.badge === currentBadge);
          btn.classList.toggle("active", isSel);
          btn.setAttribute("aria-checked", isSel ? "true" : "false");
        });
      }

      // Color
      if(cls?.color?.type==="custom"){
        colorChoice = { ...cls.color };
        setColorTab("custom");
        customBg.value = cls.color.bg || "#e3f2fd";
        customBorder.value = cls.color.border || "#2196f3";
        customText.value = cls.color.text || "#0d47a1";
      }else{
        colorChoice = { type:"palette", id: (cls?.color?.id || "blue") };
        setColorTab("palettes");
        highlightActiveSwatch();
      }
    }

    function closeClassModal(){
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden","true");
      editingClass = null;
    }

    function validateTimes(s,e){
      if(!/^\d{2}:\d{2}$/.test(s) || !/^\d{2}:\d{2}$/.test(e)) return "Please choose valid start and end times.";
      const sm = toMinutes(s), em = toMinutes(e);
      if(!Number.isFinite(sm) || !Number.isFinite(em) || sm<START_MIN || em>END_MIN) return "Time must be within 08:00 to 17:30.";
      if((sm-START_MIN)%SLOT!==0 || (em-START_MIN)%SLOT!==0) return "Times must be in 30-minute steps.";
      if(em<=sm) return "End time must be after start time.";
      return null;
    }

    // --------- Profile Actions ---------
    function setActiveProfile(id){
      activeProfileId = id;
      save(); render();
    }

    function createProfile(name="New Profile"){
      const p = { id: genId(), name, classes: [] };
      profiles[p.id] = p;
      setActiveProfile(p.id);
    }

    function renameProfile(){
      const p = profiles[activeProfileId];
      if(!p) return;
      const name = prompt("Rename profile:", p.name);
      if(!name) return;
      p.name = name.trim() || p.name;
      save(); render();
    }

    function duplicateProfile(){
      const p = profiles[activeProfileId];
      if(!p) return;
      const clone = { id: genId(), name: p.name + " (Copy)", classes: p.classes.map(c=> ({...c, id: genId()})) };
      profiles[clone.id] = clone;
      setActiveProfile(clone.id);
    }

    function deleteProfile(){
      const keys = Object.keys(profiles);
      if(keys.length<=1){ alert("At least one profile must remain."); return; }
      const p = profiles[activeProfileId];
      if(!p) return;
      if(!confirm(`Delete profile "${p.name}"? This cannot be undone.`)) return;
      delete profiles[p.id];
      activeProfileId = Object.keys(profiles)[0];
      save(); render();
    }

    // --------- Class Actions ---------
    function upsertClass(){
      const p = profiles[activeProfileId];
      if(!p) return;

      const id = classIdInput.value || genId();
      const day = parseInt(dayInput.value,10);
      const start = startInput.value;
      const end = endInput.value;
      const code = (codeInput.value||"").trim();
      const subtitle = (subtitleInput.value||"").trim();
      const location = (locationInput.value||"").trim();
      const instructor = (instructorInput.value||"").trim();
      const badge = (classBadgeInput ? classBadgeInput.value : "").trim();

      const err = validateTimes(start,end);
      if(err){ alert(err); return; }
      if(!code){ alert("Please enter Name + Section."); return; }

      let color = null;
      const tab = [...colorTabs].find(b=>b.classList.contains("active"))?.dataset.tab || "palettes";
      if(tab==="custom"){
        color = { type:"custom", bg: customBg.value, border: customBorder.value, text: customText.value };
      }else{
        color = { type:"palette", id: colorChoice.id || "blue" };
      }

      const payload = { id, day, start, end, code, subtitle, location, instructor, color, badge };

      const idx = p.classes.findIndex(c=>c.id===id);
      if(idx>=0){ p.classes[idx] = payload; } else { p.classes.push(payload); }
      save(); render(); closeClassModal();
    }

    function removeClass(){
      const p = profiles[activeProfileId];
      if(!p || !editingClass) return;
      if(!confirm(`Delete class "${editingClass.code}"?`)) return;
      p.classes = p.classes.filter(c=>c.id !== editingClass.id);
      save(); render(); closeClassModal();
    }

    // --------- Import / Export ---------
    function exportSchedules(){
      const data = {
        app: "Schedule Maker",
        version: 1,
        exportedAt: new Date().toISOString(),
        profiles: Object.values(profiles),
        preferences: prefs,
        exams: exams
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `schedule-maker-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(link.href), 0);
      showToast("Schedules exported");
    }

    function cleanImportedClass(item){
      if(!item || typeof item!=="object") throw new Error("A class entry is invalid.");
      const day = Number(item.day);
      const start = String(item.start || "");
      const end = String(item.end || "");
      if(!Number.isInteger(day) || day<1 || day>7 || validateTimes(start,end)) throw new Error("A class has an invalid day or time.");
      const safeText = value=>String(value || "").slice(0, 200);
      if(!safeText(item.code).trim()) throw new Error("A class is missing its name.");
      let color = {type:"palette", id:"blue"};
      if(item.color?.type==="palette" && PALETTES.some(p=>p.id===item.color.id)) color = {type:"palette", id:item.color.id};
      const isHex = value=>/^#[0-9a-f]{6}$/i.test(value || "");
      if(item.color?.type==="custom" && isHex(item.color.bg) && isHex(item.color.border) && isHex(item.color.text)){
        color = {type:"custom", bg:item.color.bg, border:item.color.border, text:item.color.text};
      }
      const badge = (typeof item.badge === "string" && VALID_BADGES.includes(item.badge.trim())) ? item.badge.trim() : "";
      return {id:genId(), day, start, end, code:safeText(item.code), subtitle:safeText(item.subtitle).slice(0,120), location:safeText(item.location), instructor:safeText(item.instructor), color, badge};
    }

    function cleanImportedExam(item){
      if(!item || typeof item !== "object") return null;
      const safeText = value => String(value || "").slice(0, 200);
      const code = safeText(item.code).trim();
      if(!code) return null;
      return {
        id: item.id || genId(),
        rawDate: safeText(item.rawDate),
        formattedDate: safeText(item.formattedDate),
        beYear: item.beYear ? Number(item.beYear) : null,
        ceYear: item.ceYear ? Number(item.ceYear) : null,
        timestamp: item.timestamp ? Number(item.timestamp) : 0,
        time: safeText(item.time),
        code,
        title: safeText(item.title),
        room: safeText(item.room),
        seat: safeText(item.seat),
        remark: safeText(item.remark),
        weekday: safeText(item.weekday || ""),
        formattedDateOnly: safeText(item.formattedDateOnly || ""),
        cheatsheetStatus: safeText(item.cheatsheetStatus || "unset"),
        cheatsheetNote: safeText(item.cheatsheetNote || ""),
        calculatorStatus: safeText(item.calculatorStatus || "unset"),
        calculatorNote: safeText(item.calculatorNote || ""),
        durationHours: item.durationHours !== undefined && item.durationHours !== null ? Number(item.durationHours) : null,
        durationText: safeText(item.durationText || "")
      };
    }

    async function importSchedules(file){
      try{
        if(!file || file.size>2_000_000) throw new Error("Choose a JSON file smaller than 2 MB.");
        const data = JSON.parse(await file.text());
        const incoming = Array.isArray(data.profiles) ? data.profiles : (data.name && Array.isArray(data.classes) ? [data] : []);
        if(!incoming.length && !Array.isArray(data.exams)) throw new Error("No valid profiles or exams were found.");

        if(incoming.length > 0){
          if(incoming.length>100) throw new Error("Too many profiles found.");
          const added = incoming.map(item=>{
            if(!item || !Array.isArray(item.classes) || item.classes.length>500) throw new Error("A profile is invalid or too large.");
            const id = genId();
            return {id, name:String(item.name || "Imported schedule").slice(0,80), classes:item.classes.map(cleanImportedClass)};
          });
          for(const profile of added) profiles[profile.id] = profile;
          activeProfileId = added[0].id;
        }

        if(Array.isArray(data.exams)){
          const validExams = data.exams.map(cleanImportedExam).filter(Boolean);
          if(validExams.length > 0){
            exams = validExams;
            saveExams();
          }
        }

        save(); render();
        showToast("Schedule and exam data imported");
      }catch(error){
        alert(`Could not import schedule: ${error.message}`);
      }finally{
        importFile.value = "";
      }
    }

    // --------- Exam Tracker ---------
    const SAMPLE_EXAM_RAW = `Exam Date\tExam Time\tCourse code\tCourse title\tExam Room\tSeat No\tRemark
19/10/2569\t13.00 - 16.00\tPRE380\tENGINEERING ECONOMICS\tLIB108\t58\t-
22/10/2569\t13.00 - 16.00\tCPE371\tBIG DATA ENGINEERING\tCB2506\t5\t-
26/10/2569\t9.00 - 12.00\tCPE333\tOPERATING SYSTEMS\tCB2606\t15\t-
26/10/2569\t13.00 - 16.00\tPRE380\tENGINEERING ECONOMICS\tNO EXAM-1\t127\t-
27/10/2569\t13.00 - 16.00\tCPE334\tSOFTWARE ENGINEERING\tCB2403\t47\t-
03/11/2569\t13.00 - 16.00\tCPE333\tOPERATING SYSTEMS\tNO EXAM-1\t314\t-
06/11/2569\t9.00 - 12.00\tCPE334\tSOFTWARE ENGINEERING\tNO EXAM-1\t363\t-
06/11/2569\t13.00 - 16.00\tPRE380\tENGINEERING ECONOMICS\tNO EXAM-1\t600\t-
07/11/2569\t13.00 - 16.00\tCPE371\tBIG DATA ENGINEERING\tNO EXAM-1\t180\t-
-\t- \tCPE301\tPROFESSIONAL ISSUES IN COMPUTER ENGINEERING\t-\t-\t-
-\t- \tGEN232\tCOMMUNITY BASED RESEARCH AND INNOVATION\t-\t-\t-
-\t- \tGEN241\tBEAUTY OF LIFE\t-\t-\t-`;

    function loadExams(){
      try{
        const raw = localStorage.getItem(STORAGE_EXAMS_KEY);
        exams = raw ? JSON.parse(raw) : [];
        if(!Array.isArray(exams)) exams = [];
      }catch{
        exams = [];
      }
    }

    function saveExams(){
      localStorage.setItem(STORAGE_EXAMS_KEY, JSON.stringify(exams));
      hasPendingChanges = true;
      localStorage.setItem(PENDING_KEY, "true");

      if (!currentUser) {
        updateSyncStatusUI(navigator.onLine ? "Saved locally" : "Offline");
      } else {
        if (!navigator.onLine) {
          updateSyncStatusUI("Offline");
        } else {
          updateSyncStatusUI("Syncing…");
          debounceSync();
        }
      }
    }

    function switchMainTab(tab){
      activeMainTab = tab;
      const isSchedule = (tab === "schedule");

      if (tabScheduleBtn) {
        tabScheduleBtn.classList.toggle("active", isSchedule);
        tabScheduleBtn.setAttribute("aria-selected", isSchedule ? "true" : "false");
      }
      if (tabExamsBtn) {
        tabExamsBtn.classList.toggle("active", !isSchedule);
        tabExamsBtn.setAttribute("aria-selected", !isSchedule ? "true" : "false");
      }

      if (scheduleTabContent) scheduleTabContent.style.display = isSchedule ? "block" : "none";
      if (examsTabContent) examsTabContent.style.display = isSchedule ? "none" : "block";

      if (scheduleControls) scheduleControls.style.display = isSchedule ? "flex" : "none";

      if (!isSchedule) {
        renderExams();
      }
    }

    function openExamImportModal(){
      if (!examImportModal) return;
      examImportModal.classList.add("show");
      examImportModal.setAttribute("aria-hidden", "false");
      if (rawExamText) {
        rawExamText.value = "";
        rawExamText.focus();
      }
    }

    function closeExamImportModal(){
      if (!examImportModal) return;
      examImportModal.classList.remove("show");
      examImportModal.setAttribute("aria-hidden", "true");
    }

    function formatTime12h(timeStr){
      if(!timeStr) return "-";
      return timeStr.replace(/(\d{1,2})[.:](\d{2})/g, (_, hStr, mStr) => {
        let h = parseInt(hStr, 10);
        const m = mStr;
        const ampm = h >= 12 ? "PM" : "AM";
        h = (h % 12) || 12;
        return `${h}:${m} ${ampm}`;
      });
    }

    function formatExamTime(timeStr, use24){
      if(!timeStr) return "-";
      if(use24){
        return timeStr.replace(/(\d{1,2})[.:](\d{2})/g, (_, h, m) => `${h.padStart(2, "0")}:${m}`);
      }
      return formatTime12h(timeStr);
    }

    // Measure how long (in hours) an exam will take
    function getExamDuration(timeStr){
      if(!timeStr || typeof timeStr !== "string") return null;
      const match = timeStr.match(/(\d{1,2})[.:](\d{2})\s*[-–—to]+\s*(\d{1,2})[.:](\d{2})/i);
      if(!match) return null;

      const startH = parseInt(match[1], 10);
      const startM = parseInt(match[2], 10);
      const endH = parseInt(match[3], 10);
      const endM = parseInt(match[4], 10);

      let startTotal = startH * 60 + startM;
      let endTotal = endH * 60 + endM;
      if(endTotal <= startTotal){
        endTotal += 24 * 60;
      }
      const diffMinutes = endTotal - startTotal;
      if(diffMinutes <= 0) return null;

      const hours = diffMinutes / 60;
      const formattedNumber = Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 100) / 100);
      const hourWord = hours === 1 ? "hour" : "hours";
      const hrWord = hours === 1 ? "hr" : "hrs";

      return {
        hours,
        diffMinutes,
        text: `${formattedNumber} ${hourWord}`,
        shortText: `${formattedNumber} ${hrWord}`
      };
    }

    function processExamRow(dateStr, timeStr, code, title, room, seat, remark){
      dateStr = (dateStr || "").trim();
      timeStr = (timeStr || "").trim();
      code = (code || "").trim();
      title = (title || "").trim();
      room = (room || "").trim();
      seat = (seat || "").trim();
      remark = (remark || "").trim();

      const combined = `${dateStr} ${timeStr} ${code} ${title} ${room} ${remark}`.toUpperCase();
      if (combined.includes("NO EXAM") || combined.includes("NO-EXAM")) return null;

      if (!dateStr || dateStr === "-" || !/\d/.test(dateStr)) return null;
      if (!timeStr || timeStr === "-") return null;
      if (!room || room === "-" || room.toUpperCase().includes("NO EXAM")) return null;

      const normalizedTime = timeStr.replace(/(\d{1,2})[.:](\d{2})/g, (_, h, m) => {
        return `${h.padStart(2, "0")}:${m}`;
      });

      const dateMatch = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
      let parsedTimestamp = 0;
      let formattedDate = dateStr;
      let beYear = null;
      let ceYear = null;

      if (dateMatch) {
        const day = parseInt(dateMatch[1], 10);
        const month = parseInt(dateMatch[2], 10);
        let year = parseInt(dateMatch[3], 10);
        if (year < 100) year += 2000;

        if (year > 2400) {
          beYear = year;
          ceYear = year - 543;
        } else {
          ceYear = year;
          beYear = year + 543;
        }

        const timeMatch = normalizedTime.match(/(\d{2}):(\d{2})/);
        const startH = timeMatch ? parseInt(timeMatch[1], 10) : 0;
        const startM = timeMatch ? parseInt(timeMatch[2], 10) : 0;

        const dateObj = new Date(ceYear, month - 1, day, startH, startM);
        parsedTimestamp = dateObj.getTime();

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const fullDayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const dayName = dayNames[dateObj.getDay()];
        const fullWeekday = fullDayNames[dateObj.getDay()];
        const monthName = monthNames[dateObj.getMonth()];
        formattedDate = `${dayName}, ${day} ${monthName} ${ceYear}`;
        var formattedDateOnly = `${day} ${monthName} ${ceYear}`;
        var weekday = fullWeekday;
      }

      // Auto-detect cheatsheet from remark or course title
      let cheatsheetStatus = "unset";
      let cheatsheetNote = "";
      const combinedUpper = `${remark} ${title} ${room}`.toUpperCase();
      if (combinedUpper.includes("OPEN BOOK") || combinedUpper.includes("OPEN-BOOK")) {
        cheatsheetStatus = "open_book";
        cheatsheetNote = "Open Book Exam";
      } else if (combinedUpper.includes("NO CHEAT") || combinedUpper.includes("CLOSED BOOK") || combinedUpper.includes("CLOSED-BOOK")) {
        cheatsheetStatus = "not_allowed";
        cheatsheetNote = "Closed Book";
      } else if (combinedUpper.includes("A4") || combinedUpper.includes("CHEATSHEET") || combinedUpper.includes("CHEAT SHEET") || combinedUpper.includes("FORMULA")) {
        cheatsheetStatus = "allowed";
        cheatsheetNote = remark || "1 Page A4 allowed";
      }

      // Auto-detect calculator permission from remark or course title
      let calculatorStatus = "unset";
      let calculatorNote = "";
      if (combinedUpper.includes("NO CALC") || combinedUpper.includes("NO-CALC") || combinedUpper.includes("WITHOUT CALC")) {
        calculatorStatus = "not_allowed";
        calculatorNote = "No Calculator";
      } else if (combinedUpper.includes("SCIENTIFIC")) {
        calculatorStatus = "allowed";
        calculatorNote = "Scientific Calculator";
      } else if (combinedUpper.includes("CALCULATOR") || combinedUpper.includes("CALC")) {
        calculatorStatus = "allowed";
        calculatorNote = "Calculator Allowed";
      }

      const durationInfo = getExamDuration(normalizedTime);

      return {
        id: genId(),
        rawDate: dateStr,
        formattedDate,
        weekday: weekday || "",
        formattedDateOnly: formattedDateOnly || dateStr,
        beYear,
        ceYear,
        timestamp: parsedTimestamp,
        time: normalizedTime,
        durationHours: durationInfo ? durationInfo.hours : null,
        durationText: durationInfo ? durationInfo.text : "",
        code,
        title,
        room,
        seat: (seat === "-" || !seat) ? "" : seat,
        remark: (remark === "-" || !remark) ? "" : remark,
        cheatsheetStatus,
        cheatsheetNote,
        calculatorStatus,
        calculatorNote
      };
    }

    function parseRawExamSchedule(text){
      if (!text || typeof text !== "string") return [];
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const list = [];
      const headerWords = ["exam date", "exam time", "course code", "course title", "exam room", "seat no", "remark"];

      // 1. First attempt: line-by-line tab or multi-space separated rows
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (headerWords.some(hw => lower === hw || lower.startsWith(hw))) continue;

        let parts = line.split(/\t/).map(s => s.trim());
        if (parts.length < 4) {
          parts = line.split(/\s{2,}/).map(s => s.trim());
        }
        if (parts.length >= 4) {
          const exam = processExamRow(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], parts[6]);
          if (exam) list.push(exam);
        }
      }

      // 2. Fallback: if no exams found, check if cells were pasted one-per-line
      if (list.length === 0 && lines.length >= 5) {
        const filteredTokens = lines.filter(l => !headerWords.includes(l.toLowerCase()));
        let i = 0;
        while (i < filteredTokens.length) {
          const tok = filteredTokens[i];
          if (/^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|-)$/.test(tok)) {
            const dateStr = tok;
            const timeStr = filteredTokens[i + 1] || "";
            const code = filteredTokens[i + 2] || "";
            const title = filteredTokens[i + 3] || "";
            const room = filteredTokens[i + 4] || "";
            const seat = filteredTokens[i + 5] || "";
            const remark = filteredTokens[i + 6] || "";

            const exam = processExamRow(dateStr, timeStr, code, title, room, seat, remark);
            if (exam) {
              list.push(exam);
              i += 7;
              continue;
            }
          }
          i++;
        }
      }

      // Sort chronologically
      list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      return list;
    }

    // Always measure in days, not weeks
    function getExamCountdown(timestamp){
      if (!timestamp) return { text: "", status: "upcoming" };
      const now = new Date();
      const examDate = new Date(timestamp);

      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const examDayStart = new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate()).getTime();
      const dayDiff = Math.round((examDayStart - todayStart) / (1000 * 60 * 60 * 24));

      if (dayDiff < 0) {
        const abs = Math.abs(dayDiff);
        return { text: abs === 1 ? "1 day ago" : `${abs} days ago`, status: "passed" };
      } else if (dayDiff === 0) {
        return { text: "Today", status: "today" };
      } else if (dayDiff === 1) {
        return { text: "Tomorrow (1 day)", status: "tomorrow" };
      } else {
        return { text: `In ${dayDiff} days`, status: "upcoming" };
      }
    }

    // Measure study preparation window between exams (excluding exam days themselves)
    function getStudyGapInfo(exam, prevExam){
      if (!prevExam) {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const examDate = new Date(exam.timestamp);
        const examDayStart = new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate()).getTime();
        const daysUntil = Math.round((examDayStart - todayStart) / (1000 * 60 * 60 * 24));
        if (daysUntil > 1) {
          const prepDays = daysUntil - 1;
          return {
            text: `${prepDays} day${prepDays === 1 ? "" : "s"} to study until exams begin`,
            type: "first",
            days: prepDays
          };
        } else if (daysUntil === 1) {
          return {
            text: "Half a day to study before exams begin",
            type: "tight",
            days: 0.5
          };
        } else if (daysUntil === 0) {
          return {
            text: "First exam is today",
            type: "tight",
            days: 0
          };
        }
        return null;
      }

      const currDate = new Date(exam.timestamp);
      const prevDate = new Date(prevExam.timestamp);
      const currDayStart = new Date(currDate.getFullYear(), currDate.getMonth(), currDate.getDate()).getTime();
      const prevDayStart = new Date(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate()).getTime();
      const calendarDiff = Math.round((currDayStart - prevDayStart) / (1000 * 60 * 60 * 24));

      if (calendarDiff <= 0) {
        return {
          text: `Same day exam after ${prevExam.code} (no study day)`,
          type: "tight",
          days: 0
        };
      } else if (calendarDiff === 1) {
        // Exam right after another (e.g. 26th then 27th)
        return {
          text: `Half a day to study after ${prevExam.code}`,
          type: "tight",
          days: 0.5
        };
      } else {
        // e.g. 19th then 22nd: 3 calendar days diff -> 2 days to study (20th and 21st)
        const studyDays = calendarDiff - 1;
        return {
          text: studyDays === 1
            ? `1 day to study after ${prevExam.code}`
            : `${studyDays} days to study after ${prevExam.code}`,
          type: studyDays <= 1 ? "tight" : "normal",
          days: studyDays
        };
      }
    }

    function extractBaseCourseCode(code){
      if(!code) return "";
      const cleaned = String(code).trim().toUpperCase();
      const match = cleaned.match(/^([A-Z]{2,5}\s*\d{3,5})/);
      if(match){
        return match[1].replace(/\s+/g, "");
      }
      return cleaned.split(/\s+/)[0];
    }

    function courseCodesMatch(codeA, codeB){
      if(!codeA || !codeB) return false;
      const a = String(codeA).trim().toUpperCase();
      const b = String(codeB).trim().toUpperCase();
      if(a === b) return true;

      const baseA = extractBaseCourseCode(a);
      const baseB = extractBaseCourseCode(b);
      if(baseA && baseB && baseA === baseB) return true;

      return a.includes(baseB) || b.includes(baseA);
    }

    // Resolves course color matching the color scheme selected in the schedule tab
    function getColorForCourse(courseCode){
      if(!courseCode) return { type: "palette", id: "blue" };
      const cleanCode = courseCode.trim().toUpperCase();
      const baseCode = extractBaseCourseCode(cleanCode);
      const deptPrefix = baseCode.match(/^[A-Z]+/)?.[0] || "";

      // 1. Direct match in current active schedule profile
      const currentProf = profiles[activeProfileId];
      if(currentProf && Array.isArray(currentProf.classes)){
        const directMatch = currentProf.classes.find(c => courseCodesMatch(c.code, cleanCode));
        if(directMatch && directMatch.color) return directMatch.color;
      }

      // 2. Direct match across other profiles
      for(const prof of Object.values(profiles)){
        if(prof && Array.isArray(prof.classes)){
          const directMatch = prof.classes.find(c => courseCodesMatch(c.code, cleanCode));
          if(directMatch && directMatch.color) return directMatch.color;
        }
      }

      // 3. Department prefix match in current profile (e.g. all CPE classes share color)
      if(deptPrefix && currentProf && Array.isArray(currentProf.classes)){
        const deptMatch = currentProf.classes.find(c => {
          const cBase = extractBaseCourseCode(c.code);
          return cBase.startsWith(deptPrefix) && c.color;
        });
        if(deptMatch && deptMatch.color) return deptMatch.color;
      }

      // 4. Category badge match in current profile (e.g. Major, General, Math, Science)
      const badge = getBadgeForCourse(courseCode);
      if(badge && currentProf && Array.isArray(currentProf.classes)){
        const badgeMatch = currentProf.classes.find(c => c.badge === badge && c.color);
        if(badgeMatch && badgeMatch.color) return badgeMatch.color;
      }

      // 5. Default palettes based on category badge or department prefix
      if(badge === "Major" || deptPrefix === "CPE" || deptPrefix === "PRE") return { type: "palette", id: "blue" };
      if(badge === "Math" || deptPrefix === "MTH") return { type: "palette", id: "green" };
      if(badge === "Science" || deptPrefix === "PHY" || deptPrefix === "CHM" || deptPrefix === "SCI") return { type: "palette", id: "purple" };
      if(badge === "General" || deptPrefix === "LNG" || deptPrefix === "GEN") return { type: "palette", id: "orange" };

      return { type: "palette", id: "blue" };
    }

    function getBadgeForCourse(courseCode){
      if (!courseCode) return "";
      const cleanCode = courseCode.trim().toUpperCase();

      // 1. Check current profile's classes: strictly mimic badge or lack thereof
      const currentProf = profiles[activeProfileId];
      if (currentProf && Array.isArray(currentProf.classes)) {
        const matches = currentProf.classes.filter(c => courseCodesMatch(c.code, cleanCode));
        if (matches.length > 0) {
          const withBadge = matches.find(c => c.badge);
          // If a matching class has a badge, use it; if no matching class has a badge, return ""
          return withBadge ? withBadge.badge : "";
        }
      }

      // 2. Check other profiles
      for (const prof of Object.values(profiles)) {
        if (prof && Array.isArray(prof.classes)) {
          const matches = prof.classes.filter(c => courseCodesMatch(c.code, cleanCode));
          if (matches.length > 0) {
            const withBadge = matches.find(c => c.badge);
            return withBadge ? withBadge.badge : "";
          }
        }
      }

      // 3. If course is not in any profile, it has no category badge
      return "";
    }

    function deleteExam(id){
      const ex = exams.find(e => e.id === id);
      const name = ex ? ex.code : "exam";
      if (!confirm(`Remove exam for ${name}?`)) return;
      exams = exams.filter(e => e.id !== id);
      saveExams();
      renderExams();
      showToast(`Exam for ${name} removed`);
    }

    function clearAllExams(){
      if (exams.length === 0) return;
      if (!confirm(`Are you sure you want to clear all ${exams.length} exams?`)) return;
      exams = [];
      saveExams();
      renderExams();
      showToast("All exams cleared");
    }

    function handleParseExams(){
      const text = (rawExamText?.value || "").trim();
      if (!text) {
        alert("Please paste your raw exam schedule text first.");
        return;
      }
      const parsed = parseRawExamSchedule(text);
      if (parsed.length === 0) {
        alert("No valid exam dates found in the pasted text.\n\nNote: Entries marked with 'NO EXAM' or without dates are automatically excluded.");
        return;
      }

      // Merge by code + rawDate
      const existingKeys = new Set(exams.map(e => `${e.code}_${e.rawDate}`));
      for (const newEx of parsed) {
        const key = `${newEx.code}_${newEx.rawDate}`;
        if (!existingKeys.has(key)) {
          exams.push(newEx);
          existingKeys.add(key);
        } else {
          const idx = exams.findIndex(e => `${e.code}_${e.rawDate}` === key);
          if (idx >= 0) {
            // preserve cheatsheet & calculator settings if user previously edited it
            newEx.cheatsheetStatus = exams[idx].cheatsheetStatus || newEx.cheatsheetStatus;
            newEx.cheatsheetNote = exams[idx].cheatsheetNote || newEx.cheatsheetNote;
            newEx.calculatorStatus = exams[idx].calculatorStatus || newEx.calculatorStatus;
            newEx.calculatorNote = exams[idx].calculatorNote || newEx.calculatorNote;
            exams[idx] = newEx;
          }
        }
      }

      saveExams();
      renderExams();
      closeExamImportModal();
      showToast(`Successfully imported ${parsed.length} exam${parsed.length === 1 ? "" : "s"}!`);
    }

    function loadSampleExams(){
      const parsed = parseRawExamSchedule(SAMPLE_EXAM_RAW);
      exams = parsed;
      saveExams();
      renderExams();
      showToast(`Loaded ${parsed.length} sample exams!`);
    }

    // Cheatsheet Modal Handling
    function openCheatsheetModal(examId){
      const exam = exams.find(e => e.id === examId);
      if (!exam || !cheatsheetModal) return;
      editingCheatsheetExamId = examId;
      selectedCheatsheetStatus = exam.cheatsheetStatus || "unset";
      selectedCheatsheetNote = exam.cheatsheetNote || "";

      if (cheatsheetModalTitle) {
        cheatsheetModalTitle.textContent = `Cheatsheet: ${exam.code}`;
      }
      if (cheatsheetModalSubtitle) {
        cheatsheetModalSubtitle.textContent = `Set cheatsheet and allowed materials for ${exam.code} - ${exam.title || "Exam"}`;
      }
      if (cheatsheetCustomNote) {
        cheatsheetCustomNote.value = selectedCheatsheetNote;
      }

      const optBtns = cheatsheetModal.querySelectorAll(".cheatsheet-opt-btn");
      optBtns.forEach(btn => {
        const status = btn.dataset.status;
        const note = btn.dataset.note;
        const isMatch = (status === selectedCheatsheetStatus && (!note || note === selectedCheatsheetNote));
        btn.classList.toggle("active", isMatch);
      });

      cheatsheetModal.classList.add("show");
      cheatsheetModal.setAttribute("aria-hidden", "false");
      if (cheatsheetCustomNote) cheatsheetCustomNote.focus();
    }

    function closeCheatsheetModal(){
      if (!cheatsheetModal) return;
      cheatsheetModal.classList.remove("show");
      cheatsheetModal.setAttribute("aria-hidden", "true");
      editingCheatsheetExamId = null;
    }

    function saveCheatsheetRules(){
      if (!editingCheatsheetExamId) return;
      const exam = exams.find(e => e.id === editingCheatsheetExamId);
      if (!exam) return;

      exam.cheatsheetStatus = selectedCheatsheetStatus;
      exam.cheatsheetNote = (cheatsheetCustomNote?.value || selectedCheatsheetNote || "").trim();

      saveExams();
      renderExams();
      closeCheatsheetModal();
      showToast(`Updated cheatsheet for ${exam.code}`);
    }

    // Calculator Modal Handling
    function openCalculatorModal(examId){
      const exam = exams.find(e => e.id === examId);
      if (!exam || !calculatorModal) return;
      editingCalculatorExamId = examId;
      selectedCalculatorStatus = exam.calculatorStatus || "unset";
      selectedCalculatorNote = exam.calculatorNote || "";

      if (calculatorModalTitle) {
        calculatorModalTitle.textContent = `Calculator: ${exam.code}`;
      }
      if (calculatorModalSubtitle) {
        calculatorModalSubtitle.textContent = `Set calculator permissions for ${exam.code} - ${exam.title || "Exam"}`;
      }
      if (calculatorCustomNote) {
        calculatorCustomNote.value = selectedCalculatorNote;
      }

      const optBtns = calculatorModal.querySelectorAll(".calculator-opt-btn");
      optBtns.forEach(btn => {
        const status = btn.dataset.status;
        const note = btn.dataset.note;
        const isMatch = (status === selectedCalculatorStatus && (!note || note === selectedCalculatorNote));
        btn.classList.toggle("active", isMatch);
      });

      calculatorModal.classList.add("show");
      calculatorModal.setAttribute("aria-hidden", "false");
      if (calculatorCustomNote) calculatorCustomNote.focus();
    }

    function closeCalculatorModal(){
      if (!calculatorModal) return;
      calculatorModal.classList.remove("show");
      calculatorModal.setAttribute("aria-hidden", "true");
      editingCalculatorExamId = null;
    }

    function saveCalculatorRules(){
      if (!editingCalculatorExamId) return;
      const exam = exams.find(e => e.id === editingCalculatorExamId);
      if (!exam) return;

      exam.calculatorStatus = selectedCalculatorStatus;
      exam.calculatorNote = (calculatorCustomNote?.value || selectedCalculatorNote || "").trim();

      saveExams();
      renderExams();
      closeCalculatorModal();
      showToast(`Updated calculator rule for ${exam.code}`);
    }

    function renderExams(){
      if (examCountBadge) {
        if (exams.length > 0) {
          examCountBadge.textContent = String(exams.length);
          examCountBadge.style.display = "inline-flex";
        } else {
          examCountBadge.style.display = "none";
        }
      }

      if (examTimeFormatToggle) {
        examTimeFormatToggle.checked = !!prefs.time24;
      }

      if (!exams || exams.length === 0) {
        if (examsEmptyState) examsEmptyState.style.display = "flex";
        if (examsList) {
          examsList.innerHTML = "";
          examsList.style.display = "none";
        }
        if (nextExamBanner) {
          nextExamBanner.innerHTML = "";
          nextExamBanner.style.display = "none";
        }
        if (clearExamsBtn) clearExamsBtn.style.display = "none";
        if (examsSummaryText) examsSummaryText.textContent = "Organize and track your upcoming exam schedule";
        return;
      }

      if (examsEmptyState) examsEmptyState.style.display = "none";
      if (examsList) examsList.style.display = "grid";
      if (clearExamsBtn) clearExamsBtn.style.display = "inline-flex";
      if (examsSummaryText) {
        examsSummaryText.textContent = `${exams.length} exam${exams.length === 1 ? "" : "s"} scheduled`;
      }

      // Sort chronologically
      exams.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      // Cutoff: allow exams from today onwards (or within past 3 hours)
      const cutoffTime = Date.now() - (3 * 60 * 60 * 1000);
      const nextExam = exams.find(e => (e.timestamp || 0) >= cutoffTime);

      if (nextExam && nextExamBanner) {
        const badge = getBadgeForCourse(nextExam.code);
        const cd = getExamCountdown(nextExam.timestamp);
        const formattedNextTime = formatExamTime(nextExam.time, prefs.time24);
        const nextDuration = getExamDuration(nextExam.time) || (nextExam.durationHours ? { hours: nextExam.durationHours, text: nextExam.durationText } : null);
        const nextColor = getColorForCourse(nextExam.code);

        nextExamBanner.style.display = "flex";
        nextExamBanner.style.cssText = classStyle(nextColor);
        nextExamBanner.innerHTML = `
          <div class="banner-info">
            <div class="banner-label">NEXT UPCOMING EXAM</div>
            <div class="banner-course">
              ${escapeHtml(nextExam.code)} - ${escapeHtml(nextExam.title)}
              ${badge ? ` <span class="category-badge category-badge--${badge.toLowerCase()}">${escapeHtml(badge)}</span>` : ""}
            </div>
            <div class="banner-meta">
              <span>Day: <strong>${escapeHtml(nextExam.weekday || "")}</strong></span>
              &nbsp;·&nbsp;
              <span>Date: ${escapeHtml(nextExam.formattedDateOnly || nextExam.formattedDate)}</span>
              &nbsp;·&nbsp;
              <span>Time: ${escapeHtml(formattedNextTime)}${nextDuration ? ` (<strong>${escapeHtml(nextDuration.text)}</strong>)` : ""}</span>
              &nbsp;·&nbsp;
              <span>Room: ${escapeHtml(nextExam.room)}</span>
              ${nextExam.seat ? `&nbsp;·&nbsp;<span>Seat: ${escapeHtml(nextExam.seat)}</span>` : ""}
            </div>
          </div>
          <div class="banner-countdown ${cd.status}">${escapeHtml(cd.text)}</div>
        `;
      } else if (nextExamBanner) {
        nextExamBanner.innerHTML = "";
        nextExamBanner.style.display = "none";
      }

      if (examsList) {
        examsList.innerHTML = "";
        exams.forEach((exam, idx) => {
          const isNext = nextExam && (exam.id === nextExam.id);
          const badge = getBadgeForCourse(exam.code);
          const cd = getExamCountdown(exam.timestamp);
          const formattedTime = formatExamTime(exam.time, prefs.time24);
          const duration = getExamDuration(exam.time) || (exam.durationHours ? { hours: exam.durationHours, text: exam.durationText } : null);
          const courseColor = getColorForCourse(exam.code);
          const prevExam = idx > 0 ? exams[idx - 1] : null;
          const studyGap = getStudyGapInfo(exam, prevExam);

          // Cheatsheet status & label
          let csClass = "unset";
          let csIcon = "+";
          let csText = "Cheatsheet: Unspecified";
          if (exam.cheatsheetStatus === "allowed") {
            csClass = "allowed";
            csIcon = "✓";
            csText = exam.cheatsheetNote ? `Cheatsheet: ${exam.cheatsheetNote}` : "Cheatsheet Allowed";
          } else if (exam.cheatsheetStatus === "not_allowed") {
            csClass = "not_allowed";
            csIcon = "✕";
            csText = "Closed Book (No cheatsheet)";
          } else if (exam.cheatsheetStatus === "open_book") {
            csClass = "open-book";
            csIcon = "◈";
            csText = "Open Book Exam";
          }

          // Calculator status & label
          let calcClass = "unset";
          let calcIcon = "+";
          let calcText = "Calculator: Unspecified";
          if (exam.calculatorStatus === "allowed") {
            calcClass = "allowed";
            calcIcon = "✓";
            calcText = exam.calculatorNote ? `Calculator: ${exam.calculatorNote}` : "Calculator Allowed";
          } else if (exam.calculatorStatus === "not_allowed") {
            calcClass = "not_allowed";
            calcIcon = "✕";
            calcText = "No Calculator";
          }

          const card = document.createElement("div");
          card.className = "exam-card" + (isNext ? " is-next" : "");
          card.dataset.id = exam.id;
          card.style.cssText = classStyle(courseColor);

          card.innerHTML = `
            <button type="button" class="exam-card-delete" title="Delete exam" aria-label="Delete ${escapeHtml(exam.code)} exam">&times;</button>
            <div class="exam-card-top">
              <div class="exam-date-badge">
                <span class="exam-weekday">${escapeHtml(exam.weekday || "")}</span>
                <span class="exam-date-num">${escapeHtml(exam.formattedDateOnly || exam.formattedDate)}</span>
                ${exam.beYear ? `<span class="exam-be-year">(${escapeHtml(exam.beYear)} B.E.)</span>` : ""}
              </div>
              <div class="exam-top-badges">
                ${duration ? `<span class="exam-duration-pill" title="Exam duration: ${escapeHtml(duration.text)}">◷ ${escapeHtml(duration.text)}</span>` : ""}
                <span class="exam-countdown ${cd.status}">${escapeHtml(cd.text)}</span>
              </div>
            </div>
            <div class="exam-code-row">
              <span class="exam-code">${escapeHtml(exam.code)}</span>
              ${badge ? `<span class="category-badge category-badge--${badge.toLowerCase()}">${escapeHtml(badge)}</span>` : ""}
            </div>
            <div class="exam-title">${escapeHtml(exam.title || "No Title")}</div>

            ${studyGap ? `
              <div class="exam-study-gap ${studyGap.type}">
                <span class="gap-icon">◷</span>
                <span class="gap-text">${escapeHtml(studyGap.text)}</span>
              </div>
            ` : ""}

            <div class="exam-indicators-row">
              <button type="button" class="cheatsheet-pill ${csClass}" data-id="${exam.id}" title="Click to view or change cheatsheet permissions">
                <span class="pill-sym">${csIcon}</span>
                <span class="pill-text">${escapeHtml(csText)}</span>
              </button>
              <button type="button" class="calculator-pill ${calcClass}" data-id="${exam.id}" title="Click to view or change calculator permissions">
                <span class="pill-sym">${calcIcon}</span>
                <span class="pill-text">${escapeHtml(calcText)}</span>
              </button>
            </div>

            <div class="exam-meta-grid">
              <div class="exam-meta-item">
                <span class="exam-meta-label">Time</span>
                <span class="exam-meta-val">${escapeHtml(formattedTime || "-")}</span>
              </div>
              <div class="exam-meta-item">
                <span class="exam-meta-label">Duration</span>
                <span class="exam-meta-val exam-duration-val">${duration ? escapeHtml(duration.text) : "-"}</span>
              </div>
              <div class="exam-meta-item">
                <span class="exam-meta-label">Room</span>
                <span class="exam-meta-val">${escapeHtml(exam.room || "-")}</span>
              </div>
              <div class="exam-meta-item">
                <span class="exam-meta-label">Seat No</span>
                <span class="exam-meta-val">${escapeHtml(exam.seat || "-")}</span>
              </div>
              ${exam.remark && exam.remark !== "-" ? `
                <div class="exam-meta-item full-width" style="grid-column: 1 / -1;">
                  <span class="exam-meta-label">Remark</span>
                  <span class="exam-meta-val">${escapeHtml(exam.remark)}</span>
                </div>
              ` : ""}
            </div>
          `;

          const delBtn = card.querySelector(".exam-card-delete");
          if (delBtn) {
            delBtn.addEventListener("click", () => deleteExam(exam.id));
          }

          const csBtn = card.querySelector(".cheatsheet-pill");
          if (csBtn) {
            csBtn.addEventListener("click", () => openCheatsheetModal(exam.id));
          }

          const calcBtn = card.querySelector(".calculator-pill");
          if (calcBtn) {
            calcBtn.addEventListener("click", () => openCalculatorModal(exam.id));
          }

          examsList.appendChild(card);
        });
      }
    }

    function isTypingTarget(target){
      return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable;
    }

    // --------- Events ---------
    window.addEventListener("DOMContentLoaded", ()=>{
      load();
      renderPaletteSwatches();
      render();
      initSupabase();

      if (accountBtn) accountBtn.addEventListener("click", openAccountModal);
      if (closeAccountBtn) closeAccountBtn.addEventListener("click", closeAccountModal);
      if (accountModal) accountModal.querySelector(".backdrop").addEventListener("click", closeAccountModal);

      if (sendMagicLinkBtn) sendMagicLinkBtn.addEventListener("click", sendMagicLink);
      if (manualSyncBtn) manualSyncBtn.addEventListener("click", () => {
        syncWithCloud();
        showToast("Syncing...");
      });
      if (signOutBtn) signOutBtn.addEventListener("click", handleSignOut);

      if (choiceUploadLocalBtn) choiceUploadLocalBtn.addEventListener("click", () => syncWithCloud("upload"));
      if (choiceUseCloudBtn) choiceUseCloudBtn.addEventListener("click", () => syncWithCloud("use_cloud"));
      if (choiceMergeBtn) choiceMergeBtn.addEventListener("click", () => syncWithCloud("merge"));
      if (conflictModal) conflictModal.querySelector(".backdrop").addEventListener("click", closeConflictModal);

      window.addEventListener("online", () => {
        if (currentUser) {
          if (hasPendingChanges) {
            updateSyncStatusUI("Syncing…");
            syncWithCloud();
          } else {
            updateSyncStatusUI("Synced");
          }
        } else {
          updateSyncStatusUI("Saved locally");
        }
      });

      window.addEventListener("offline", () => {
        updateSyncStatusUI("Offline");
      });

      setInterval(() => {
        if (currentUser && hasPendingChanges && navigator.onLine) {
          syncWithCloud();
        }
      }, 15000);

      // Periodic check every 15 seconds to update active class glow in real-time
      setInterval(updateCurrentClassHighlight, 15000);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) updateCurrentClassHighlight();
      });
      window.addEventListener("focus", updateCurrentClassHighlight);

      profileSelect.addEventListener("change", e=> setActiveProfile(e.target.value));
      newProfileBtn.addEventListener("click", ()=> createProfile("New Profile"));
      renameProfileBtn.addEventListener("click", renameProfile);
      duplicateProfileBtn.addEventListener("click", duplicateProfile);
      deleteProfileBtn.addEventListener("click", deleteProfile);
      addClassBtn.addEventListener("click", ()=> openClassModal(null));

      if (badgeFilterSelect) {
        badgeFilterSelect.value = activeBadgeFilter;
        badgeFilterSelect.addEventListener("change", e=>{
          activeBadgeFilter = e.target.value;
          buildGrid();
          buildAgenda();
        });
      }

      if (badgePicker) {
        badgePicker.querySelectorAll(".badge-opt-btn").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const val = btn.dataset.badge || "";
            if (classBadgeInput) classBadgeInput.value = val;
            badgePicker.querySelectorAll(".badge-opt-btn").forEach(b=>{
              const isSel = (b === btn);
              b.classList.toggle("active", isSel);
              b.setAttribute("aria-checked", isSel ? "true" : "false");
            });
          });
        });
      }
      exportBtn.addEventListener("click", exportSchedules);
      importBtn.addEventListener("click", ()=>importFile.click());
      importFile.addEventListener("change", ()=>importSchedules(importFile.files[0]));
      shortcutsBtn.addEventListener("click", openShortcuts);
      closeShortcutsBtn.addEventListener("click", closeShortcuts);
      shortcutsModal.querySelector(".backdrop").addEventListener("click", closeShortcuts);
      installBtn.addEventListener("click", async ()=>{
        if(!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        installBtn.hidden = true;
      });

      // Main tab navigation (Schedule vs Exam Tracker)
      if (tabScheduleBtn) tabScheduleBtn.addEventListener("click", () => switchMainTab("schedule"));
      if (tabExamsBtn) tabExamsBtn.addEventListener("click", () => switchMainTab("exams"));

      // Exam Tracker actions
      if (openExamImportBtn) openExamImportBtn.addEventListener("click", openExamImportModal);
      if (emptyImportBtn) emptyImportBtn.addEventListener("click", openExamImportModal);
      if (cancelExamImportBtn) cancelExamImportBtn.addEventListener("click", closeExamImportModal);
      if (parseExamBtn) parseExamBtn.addEventListener("click", handleParseExams);
      if (insertSampleRawBtn) {
        insertSampleRawBtn.addEventListener("click", () => {
          if (rawExamText) rawExamText.value = SAMPLE_EXAM_RAW;
        });
      }
      if (loadSampleExamsBtn) loadSampleExamsBtn.addEventListener("click", loadSampleExams);
      if (clearExamsBtn) clearExamsBtn.addEventListener("click", clearAllExams);

      if (examTimeFormatToggle) {
        examTimeFormatToggle.checked = !!prefs.time24;
        examTimeFormatToggle.addEventListener("change", e => {
          prefs.time24 = !!e.target.checked;
          if (timeFormatToggle) timeFormatToggle.checked = prefs.time24;
          save();
          render();
        });
      }

      if (examImportModal) {
        const modalBackdrop = examImportModal.querySelector(".backdrop");
        if (modalBackdrop) modalBackdrop.addEventListener("click", closeExamImportModal);
      }

      // Cheatsheet modal interactions
      if (cancelCheatsheetBtn) cancelCheatsheetBtn.addEventListener("click", closeCheatsheetModal);
      if (saveCheatsheetBtn) saveCheatsheetBtn.addEventListener("click", saveCheatsheetRules);
      if (cheatsheetModal) {
        const csBackdrop = cheatsheetModal.querySelector(".backdrop");
        if (csBackdrop) csBackdrop.addEventListener("click", closeCheatsheetModal);

        cheatsheetModal.querySelectorAll(".cheatsheet-opt-btn").forEach(btn => {
          btn.addEventListener("click", () => {
            selectedCheatsheetStatus = btn.dataset.status || "unset";
            selectedCheatsheetNote = btn.dataset.note || "";
            if (cheatsheetCustomNote && selectedCheatsheetNote) {
              cheatsheetCustomNote.value = selectedCheatsheetNote;
            } else if (cheatsheetCustomNote && selectedCheatsheetStatus === "unset") {
              cheatsheetCustomNote.value = "";
            }
            cheatsheetModal.querySelectorAll(".cheatsheet-opt-btn").forEach(b => {
              b.classList.toggle("active", b === btn);
            });
          });
        });
      }

      // Calculator modal interactions
      if (cancelCalculatorBtn) cancelCalculatorBtn.addEventListener("click", closeCalculatorModal);
      if (saveCalculatorBtn) saveCalculatorBtn.addEventListener("click", saveCalculatorRules);
      if (calculatorModal) {
        const calcBackdrop = calculatorModal.querySelector(".backdrop");
        if (calcBackdrop) calcBackdrop.addEventListener("click", closeCalculatorModal);

        calculatorModal.querySelectorAll(".calculator-opt-btn").forEach(btn => {
          btn.addEventListener("click", () => {
            selectedCalculatorStatus = btn.dataset.status || "unset";
            selectedCalculatorNote = btn.dataset.note || "";
            if (calculatorCustomNote && selectedCalculatorNote) {
              calculatorCustomNote.value = selectedCalculatorNote;
            } else if (calculatorCustomNote && selectedCalculatorStatus === "unset") {
              calculatorCustomNote.value = "";
            }
            calculatorModal.querySelectorAll(".calculator-opt-btn").forEach(b => {
              b.classList.toggle("active", b === btn);
            });
          });
        });
      }

      document.addEventListener("keydown", event=>{
        if(event.key==="Escape"){
          if(modal.classList.contains("show")) closeClassModal();
          if(shortcutsModal.classList.contains("show")) closeShortcuts();
          if(accountModal && accountModal.classList.contains("show")) closeAccountModal();
          if(conflictModal && conflictModal.classList.contains("show")) closeConflictModal();
          if(examImportModal && examImportModal.classList.contains("show")) closeExamImportModal();
          if(cheatsheetModal && cheatsheetModal.classList.contains("show")) closeCheatsheetModal();
          if(calculatorModal && calculatorModal.classList.contains("show")) closeCalculatorModal();
          return;
        }
        if(event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
        const key = event.key.toLowerCase();
        if(!modal.classList.contains("show") && !shortcutsModal.classList.contains("show") && !accountModal.classList.contains("show") && !conflictModal.classList.contains("show") && !(examImportModal && examImportModal.classList.contains("show")) && !(cheatsheetModal && cheatsheetModal.classList.contains("show")) && !(calculatorModal && calculatorModal.classList.contains("show"))){
          if(key==="a"){ event.preventDefault(); openClassModal(null); }
          else if(key==="e"){ event.preventDefault(); exportSchedules(); }
          else if(key==="i"){ event.preventDefault(); importFile.click(); }
          else if(event.key==="?"){ event.preventDefault(); openShortcuts(); }
        }
      });

      timeFormatToggle.addEventListener("change", e=>{
        prefs.time24 = !!e.target.checked;
        if (examTimeFormatToggle) examTimeFormatToggle.checked = prefs.time24;
        save(); render();
      });

      weekendToggle.addEventListener("change", e=>{
        prefs.showWeekends = !!e.target.checked;
        save(); render();
      });

      darkModeToggle.addEventListener("change", e=>{
        prefs.darkMode = !!e.target.checked;
        save(); render();
      });

      // Modal interactions
      backdrop.addEventListener("click", closeClassModal);
      cancelClassBtn.addEventListener("click", closeClassModal);
      saveClassBtn.addEventListener("click", upsertClass);
      deleteClassBtn.addEventListener("click", removeClass);

      colorTabs.forEach(tab=>{
        tab.addEventListener("click", ()=> setColorTab(tab.dataset.tab));
      });

      window.addEventListener("beforeinstallprompt", event=>{
        event.preventDefault();
        deferredInstallPrompt = event;
        installBtn.hidden = false;
      });
      window.addEventListener("appinstalled", ()=>{
        deferredInstallPrompt = null;
        installBtn.hidden = true;
        showToast("Schedule Maker installed");
      });

      if("serviceWorker" in navigator){
        navigator.serviceWorker.register("./service-worker.js").then(reg=>{
          // If a newer worker is already waiting, activate it immediately.
          if(reg.waiting){
            reg.waiting.postMessage({ type:"SKIP_WAITING" });
          }
          reg.addEventListener("updatefound", ()=>{
            const installing = reg.installing;
            if(!installing) return;
            installing.addEventListener("statechange", ()=>{
              // Reload only when an update is installed AND a controller already
              // exists (i.e. not on the very first visit), avoiding reload loops.
              if(installing.state==="installed" && navigator.serviceWorker.controller){
                window.location.reload();
              }
            });
          });
        }).catch(error=>console.warn("Offline support unavailable", error));
      }
    });
