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

    const PALETTES = [
      { id:"orange", name:"Orange", bg:"#fff4e5", border:"#ff9800", text:"#e65100" },
      { id:"blue",   name:"Blue",   bg:"#e3f2fd", border:"#2196f3", text:"#0d47a1" },
      { id:"green",  name:"Green",  bg:"#e8f5e9", border:"#4caf50", text:"#1b5e20" },
      { id:"purple", name:"Purple", bg:"#f3e5f5", border:"#9c27b0", text:"#4a148c" },
      { id:"red",    name:"Red",    bg:"#ffebee", border:"#f44336", text:"#b71c1c" },
      { id:"teal",   name:"Teal",   bg:"#e0f2f1", border:"#009688", text:"#004d40" },
      { id:"amber",  name:"Amber",  bg:"#fffde7", border:"#fbc02d", text:"#f57f17" },
      { id:"gray",   name:"Gray",   bg:"#f3f4f6", border:"#9ca3af", text:"#374151" },
    ];

    const STORAGE_KEY = "scheduleMaker.profiles.v1";
    const ACTIVE_KEY  = "scheduleMaker.activeProfile.v1";
    const PREFS_KEY   = "scheduleMaker.prefs.v1"; // global prefs like time format

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

    // --------- Dark Mode ---------
    function applyDarkMode(){
      document.documentElement.classList.toggle("dark", !!prefs.darkMode);
      darkModeToggle.checked = !!prefs.darkMode;
    }

    // --------- State ---------
    let profiles = {};    // {id: {id, name, classes:[...]} }
    let activeProfileId = null;
    let prefs = { time24: true, darkMode: false, showWeekends: false };

    // Preload default "Computer Engineering" profile from the provided schedule
    function defaultProfiles(){
      const ce = {
        id: genId(),
        name: "Computer Engineering",
        classes: [
          // day: 1=Mon..7=Sun
          { id:genId(), day:1, start:"09:30", end:"12:30", code:"LNG321 S2",   subtitle:"English for Engineering", location:"CB1301",            instructor:"RACHANEE",         color:{type:"palette", id:"orange"} },
          { id:genId(), day:2, start:"08:30", end:"10:00", code:"MTH234 S31",  subtitle:"Differential Equations", location:"CB2505",            instructor:"Songpon",          color:{type:"palette", id:"green"} },
          { id:genId(), day:2, start:"10:30", end:"12:30", code:"PHY10401 S31",subtitle:"Physics for Engineers",   location:"SC2110",            instructor:"Tanapat, Thana",   color:{type:"palette", id:"purple"} },
          { id:genId(), day:2, start:"13:30", end:"17:30", code:"CPE231 S31",  subtitle:"Big Data Engineering",   location:"CPE1121",           instructor:"Peerapon",         color:{type:"palette", id:"blue"} },
          { id:genId(), day:3, start:"10:30", end:"12:30", code:"GEN101 S40",  subtitle:"Physical Education",     location:"GYM (KFC 3rd Floor)",instructor:"Nanthanan",        color:{type:"palette", id:"red"} },
          { id:genId(), day:3, start:"13:30", end:"16:30", code:"GEN231 S35",  subtitle:"Digital Literacy",       location:"ONLINE",            instructor:"Suthidee",         color:{type:"palette", id:"teal"} },
          { id:genId(), day:4, start:"08:30", end:"12:30", code:"CPE222 S32",  subtitle:"Computer Organization",  location:"LIB108",            instructor:"Suthatip, Pongsagon", color:{type:"palette", id:"amber"} },
          { id:genId(), day:5, start:"08:30", end:"10:00", code:"MTH234 S31",  subtitle:"Differential Equations", location:"CB2505",            instructor:"Songpon",          color:{type:"palette", id:"green"} },
          { id:genId(), day:5, start:"11:30", end:"12:30", code:"PHY10401 S31",subtitle:"Physics for Engineers",   location:"SC2110",            instructor:"Tanapat, Thana",   color:{type:"palette", id:"purple"} },
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
        prefs = JSON.parse(localStorage.getItem(PREFS_KEY)) || { time24: true, darkMode: false, showWeekends: false };
        if(prefs.darkMode === undefined) prefs.darkMode = false;
        if(prefs.showWeekends === undefined) prefs.showWeekends = false;
      }catch{ profiles={}; activeProfileId=null; prefs={ time24:true, darkMode:false, showWeekends:false }; }
      if(Object.keys(profiles).length===0){
        profiles = defaultProfiles();
        const first = Object.values(profiles).find(p=>p.name==="Blank") || Object.values(profiles)[0];
        activeProfileId = first.id;
        save();
      }
      if(!profiles[activeProfileId]){
        activeProfileId = Object.keys(profiles)[0];
      }
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
        preferences: prefs
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

      return {
        profiles: mergedProfiles,
        activeProfileId: mergedActiveId,
        preferences: mergedPrefs
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
        start = Math.min(start, END_MIN - duration);
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

        const block = document.createElement("div");
        block.className = "class-block";
        block.style.gridRow = r;
        block.style.gridColumn = (sIdx+2) + " / " + (eIdx+2);
        block.style.cssText += classStyle(cls.color);
        block.dataset.id = cls.id;
        block.draggable = true;
        block.tabIndex = 0;
        block.setAttribute("role", "button");
        block.setAttribute("aria-label", `${cls.code}, ${DAYS[cls.day-1]}, ${cls.start} to ${cls.end}. Drag to move or press Enter to edit.`);
        block.addEventListener("dragstart", event=>beginDrag(event, cls));
        block.addEventListener("dragend", endDrag);
        block.addEventListener("keydown", event=>{
          if(event.key==="Enter" || event.key===" "){ event.preventDefault(); openClassModal(cls); }
        });

        const code = document.createElement("div");
        code.className="class-code";
        code.textContent = cls.code;

        const sub1 = document.createElement("div");
        sub1.className = "class-sub";
        sub1.style.cssText += classStyle(cls.color); // colorise location
        sub1.textContent = cls.location;

        const sub2 = document.createElement("div");
        sub2.className = "class-sub";
        sub2.style.cssText += classStyle(cls.color); // colorise professor
        sub2.textContent = cls.instructor;

        block.appendChild(code);
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
          const row = document.createElement("div");
          row.className = "agenda-item";
          row.style.cssText += classStyle(cls.color);
          row.dataset.id = cls.id;
          row.draggable = true;
          row.tabIndex = 0;
          row.setAttribute("role", "button");
          row.setAttribute("aria-label", `${cls.code}, ${day.name}, ${cls.start} to ${cls.end}. Drag to another day or press Enter to edit.`);
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
          const code = document.createElement("div");
          code.className = "code";
          code.style.cssText = classStyle(cls.color) + "color:var(--ctx)";
          code.textContent = cls.code;
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
          content.append(code);
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
      weekendToggle.checked = !!prefs.showWeekends;
      applyDarkMode();
      initDayOptions();
      initTimeOptions();
      buildGrid();
      buildAgenda();
    }

    // --------- Modal Logic ---------
    function renderPaletteSwatches(){
      paletteSwatches.innerHTML = "";
      PALETTES.forEach(p=>{
        const el = document.createElement("div");
        el.className = "swatch";
        el.dataset.id = p.id;
        el.innerHTML = `
          <div class="preview" style="background:${p.bg};color:${p.border}"></div>
          <div>
            <div style="font-weight:700">${p.name}</div>
            <div style="font-size:.75rem;color:var(--text-3)">${p.bg} / ${p.border} / ${p.text}</div>
          </div>
        `;
        el.addEventListener("click", ()=>{
          colorChoice = { type:"palette", id:p.id };
          // visual select (border highlight)
          [...paletteSwatches.children].forEach(c=> c.style.outline="none");
          el.style.outline = `2px solid var(--accent)`;
        });
        paletteSwatches.appendChild(el);
      });
    }

    function setColorTab(tab){
      [...colorTabs].forEach(b=> b.classList.toggle("active", b.dataset.tab===tab));
      palettePanel.style.display = tab==="palettes" ? "block":"none";
      customPanel.style.display = tab==="custom" ? "grid":"none";
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
        [...paletteSwatches.children].forEach(c=> c.style.outline = (c.dataset.id===colorChoice.id) ? `2px solid var(--accent)` : "none");
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

      const payload = { id, day, start, end, code, subtitle, location, instructor, color };

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
        preferences: prefs
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
      return {id:genId(), day, start, end, code:safeText(item.code), subtitle:safeText(item.subtitle).slice(0,120), location:safeText(item.location), instructor:safeText(item.instructor), color};
    }

    async function importSchedules(file){
      try{
        if(!file || file.size>2_000_000) throw new Error("Choose a JSON file smaller than 2 MB.");
        const data = JSON.parse(await file.text());
        const incoming = Array.isArray(data.profiles) ? data.profiles : (data.name && Array.isArray(data.classes) ? [data] : []);
        if(!incoming.length || incoming.length>100) throw new Error("No valid profiles were found.");
        const added = incoming.map(item=>{
          if(!item || !Array.isArray(item.classes) || item.classes.length>500) throw new Error("A profile is invalid or too large.");
          const id = genId();
          return {id, name:String(item.name || "Imported schedule").slice(0,80), classes:item.classes.map(cleanImportedClass)};
        });
        for(const profile of added) profiles[profile.id] = profile;
        activeProfileId = added[0].id;
        save(); render();
        showToast(`Imported ${added.length} profile${added.length===1 ? "" : "s"}`);
      }catch(error){
        alert(`Could not import schedule: ${error.message}`);
      }finally{
        importFile.value = "";
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

      profileSelect.addEventListener("change", e=> setActiveProfile(e.target.value));
      newProfileBtn.addEventListener("click", ()=> createProfile("New Profile"));
      renameProfileBtn.addEventListener("click", renameProfile);
      duplicateProfileBtn.addEventListener("click", duplicateProfile);
      deleteProfileBtn.addEventListener("click", deleteProfile);
      addClassBtn.addEventListener("click", ()=> openClassModal(null));
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

      document.addEventListener("keydown", event=>{
        if(event.key==="Escape"){
          if(modal.classList.contains("show")) closeClassModal();
          if(shortcutsModal.classList.contains("show")) closeShortcuts();
          if(accountModal && accountModal.classList.contains("show")) closeAccountModal();
          if(conflictModal && conflictModal.classList.contains("show")) closeConflictModal();
          return;
        }
        if(event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
        const key = event.key.toLowerCase();
        if(!modal.classList.contains("show") && !shortcutsModal.classList.contains("show") && !accountModal.classList.contains("show") && !conflictModal.classList.contains("show")){
          if(key==="a"){ event.preventDefault(); openClassModal(null); }
          else if(key==="e"){ event.preventDefault(); exportSchedules(); }
          else if(key==="i"){ event.preventDefault(); importFile.click(); }
          else if(event.key==="?"){ event.preventDefault(); openShortcuts(); }
        }
      });

      timeFormatToggle.addEventListener("change", e=>{
        prefs.time24 = !!e.target.checked;
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
