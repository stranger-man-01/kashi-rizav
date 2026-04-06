/**
 * cms-bar.js — Kashi Rivaz Live Admin CMS
 * ─────────────────────────────────────────
 * Drop this script into ANY page. When admin is signed in,
 * a floating toolbar appears. Admin can:
 *  • Toggle EDIT MODE → click any labelled element to edit in-place
 *  • Post a site-wide Announcement banner (all visitors see it)
 *  • Replace images by clicking them
 *  • Upload new photos directly from the page
 *  • One-click open to Full Admin Dashboard
 *  • Save / discard all changes live
 *
 * Secret admin access from website: press  Ctrl + Shift + A
 */

(function CMS() {
    'use strict';

    /* ═══════════════════════════════════════════════
       CONFIG
    ═══════════════════════════════════════════════ */
    const FALLBACK_USER  = 'admin';
    const FALLBACK_PASS  = 'KashiRivaz@Admin2024!';
    const ADMIN_KEY      = 'KR_Admin_Secret_K9x2pLmQ8vRnWt4j';
    const LS_CONTENT     = 'kr_cms_content';   // localStorage key for content
    const LS_ANNOUNCE    = 'kr_cms_announce';  // localStorage key for announcement
    const SESSION_KEY    = 'adminSession';

    /* ═══════════════════════════════════════════════
       STATE
    ═══════════════════════════════════════════════ */
    let isAdmin    = false;
    let editMode   = false;
    let changes    = {};     // { key: { value, type } }
    let originals  = {};     // { key: original_value }

    /* ═══════════════════════════════════════════════
       BOOT
    ═══════════════════════════════════════════════ */
    document.addEventListener('DOMContentLoaded', boot);
    // Also run if script loads after DOM is ready
    if (document.readyState !== 'loading') boot();

    async function boot() {
        // Apply saved CMS content to page (for ALL visitors — from localStorage first)
        await applyPageContent();
        applyAnnouncement();

        // Always load latest content from server (public endpoint, no auth needed)
        loadPublicContent();

        // Admin detection
        const session = sessionStorage.getItem(SESSION_KEY) || '';
        if (session) {
            isAdmin = true;
            injectToolbar();
            fetchServerContent(); // Admin gets full content including hidden keys
        }

        // Secret shortcut: Ctrl + Shift + A → admin login popup
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.shiftKey && e.key === 'A') {
                e.preventDefault();
                isAdmin ? toggleEditMode() : showLoginPopup();
            }
        });
    }

    /* ═══════════════════════════════════════════════
       CMS CONTENT — LOAD & APPLY
    ═══════════════════════════════════════════════ */
    async function fetchServerContent() {
        try {
            const r = await fetch('/api/admin/content', {
                headers: { 'X-Admin-Key': ADMIN_KEY, 'X-Admin-Session': sessionStorage.getItem(SESSION_KEY) || '' }
            });
            const d = await r.json();
            if (d.success && d.content) {
                const local = getLocalContent();
                Object.assign(local, d.content);
                localStorage.setItem(LS_CONTENT, JSON.stringify(local));
                applyPageContent();
            }
        } catch (e) { /* server offline */ }
    }

    // Load CMS content for regular visitors (no auth needed)
    async function loadPublicContent() {
        try {
            const r = await fetch('/api/cms-content');
            const d = await r.json();
            if (d.success && d.content) {
                const local = getLocalContent();
                // Server is source of truth — merge server data into localStorage
                Object.assign(local, d.content);
                localStorage.setItem(LS_CONTENT, JSON.stringify(local));
                applyPageContent();
            }
        } catch (e) { /* server offline — localStorage data already applied */ }
    }

    function getLocalContent() {
        try { return JSON.parse(localStorage.getItem(LS_CONTENT)) || {}; } catch { return {}; }
    }

    async function applyPageContent() {
        const content = getLocalContent();
        document.querySelectorAll('[data-cms-key]').forEach(el => {
            const key = el.dataset.cmsKey;
            if (!content[key]) return;
            const item = content[key];
            originals[key] = originals[key] || el.innerHTML;
            if (item.type === 'image' && el.tagName === 'IMG') {
                el.src = item.value;
            } else if (item.type === 'image' && el.style.backgroundImage !== undefined) {
                el.style.backgroundImage = `url('${item.value}')`;
            } else {
                el.innerHTML = item.value;
            }
        });
    }

    /* ═══════════════════════════════════════════════
       ANNOUNCEMENT BANNER
    ═══════════════════════════════════════════════ */
    function getAnnouncement() {
        try { return JSON.parse(localStorage.getItem(LS_ANNOUNCE)) || null; } catch { return null; }
    }

    function applyAnnouncement() {
        const ann = getAnnouncement();
        const existing = document.getElementById('kr-announce-bar');
        if (existing) existing.remove();
        if (!ann || !ann.enabled || !ann.text) return;

        const bar = document.createElement('div');
        bar.id = 'kr-announce-bar';
        bar.style.cssText = `
            position:fixed;top:0;left:0;right:0;z-index:99998;
            background:linear-gradient(135deg,${ann.color||'#8B1538'},${ann.colorEnd||'#c02050'});
            color:#fff;text-align:center;padding:0.5rem 3rem;
            font-size:0.85rem;font-weight:600;font-family:'Inter',sans-serif;
            display:flex;align-items:center;justify-content:center;gap:0.75rem;
            box-shadow:0 2px 12px rgba(0,0,0,0.25);
            animation:annSlideDown 0.4s ease;
        `;
        bar.innerHTML = `
            <span>${ann.emoji||'📢'}</span>
            <span id="kr-ann-text">${ann.text}</span>
            ${ann.link ? `<a href="${ann.link}" style="color:#f0c040;font-weight:700;text-decoration:underline;white-space:nowrap;">${ann.linkText||'Learn More'}</a>` : ''}
            <button onclick="this.parentElement.remove()" style="position:absolute;right:1rem;top:50%;transform:translateY(-50%);background:none;border:none;color:#fff;font-size:1rem;cursor:pointer;opacity:0.7">✕</button>
        `;
        document.body.prepend(bar);
        // Push page content down
        document.body.style.paddingTop = bar.offsetHeight + 'px';
    }

    /* ═══════════════════════════════════════════════
       TOOLBAR INJECTION
    ═══════════════════════════════════════════════ */
    function injectToolbar() {
        if (document.getElementById('kr-cms-bar')) return;

        // Inject styles
        const style = document.createElement('style');
        style.textContent = `
            @keyframes cmsSlideIn { from{transform:translateY(-100%)} to{transform:translateY(0)} }
            @keyframes annSlideDown { from{transform:translateY(-100%);opacity:0} to{transform:translateY(0);opacity:1} }
            @keyframes cmsPulse { 0%,100%{box-shadow:0 0 0 0 rgba(255,193,7,0.4)} 50%{box-shadow:0 0 0 6px rgba(255,193,7,0)} }

            #kr-cms-bar {
                position:fixed; top:0; left:0; right:0; z-index:99999;
                background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);
                border-bottom:2px solid #D4AF37;
                display:flex; align-items:center; gap:0; height:42px;
                font-family:'Inter',sans-serif; font-size:0.8rem;
                animation:cmsSlideIn 0.35s cubic-bezier(0.34,1.56,0.64,1);
                box-shadow:0 4px 20px rgba(0,0,0,0.4);
            }
            #kr-cms-bar .cms-logo {
                background:#D4AF37; color:#0f172a; padding:0 1rem;
                height:100%; display:flex; align-items:center; gap:0.4rem;
                font-weight:800; font-size:0.82rem; white-space:nowrap;
                flex-shrink:0;
            }
            #kr-cms-bar .cms-page-name {
                color:rgba(255,255,255,0.4); font-size:0.75rem; padding:0 1rem;
                border-right:1px solid rgba(255,255,255,0.1); height:100%;
                display:flex; align-items:center; white-space:nowrap;
            }
            #kr-cms-bar .cms-btns {
                display:flex; align-items:center; gap:0.25rem;
                padding:0 0.75rem; flex:1;
            }
            #kr-cms-bar .cms-btn {
                display:inline-flex; align-items:center; gap:0.35rem;
                padding:0.3rem 0.75rem; border-radius:6px; font-size:0.78rem;
                font-weight:600; cursor:pointer; border:none; font-family:'Inter',sans-serif;
                transition:all 0.18s; color:#fff; background:rgba(255,255,255,0.07);
                white-space:nowrap;
            }
            #kr-cms-bar .cms-btn:hover { background:rgba(255,255,255,0.15); }
            #kr-cms-bar .cms-btn.edit-on {
                background:#D4AF37; color:#0f172a; animation:cmsPulse 1.5s infinite;
            }
            #kr-cms-bar .cms-btn.danger { background:rgba(239,68,68,0.15); color:#fca5a5; }
            #kr-cms-bar .cms-btn.danger:hover { background:rgba(239,68,68,0.3); }
            #kr-cms-bar .cms-btn.success { background:rgba(16,185,129,0.15); color:#6ee7b7; }
            #kr-cms-bar .cms-btn.success:hover { background:rgba(16,185,129,0.3); }
            #kr-cms-bar .cms-sep { width:1px; height:24px; background:rgba(255,255,255,0.1); margin:0 0.15rem; }
            #kr-cms-bar .cms-right { margin-left:auto; display:flex; align-items:center; gap:0.25rem; padding-right:0.75rem; }
            #kr-cms-bar .cms-user { color:rgba(255,255,255,0.5); font-size:0.75rem; padding-right:0.5rem; }

            /* Edit mode overlay on elements */
            .cms-editable {
                outline:2px dashed rgba(212,175,55,0.6) !important;
                outline-offset:3px !important;
                cursor:text !important;
                transition:outline 0.2s, background 0.2s !important;
                position:relative !important;
            }
            .cms-editable:hover {
                outline-color:#D4AF37 !important;
                background:rgba(212,175,55,0.06) !important;
            }
            .cms-editable:focus {
                outline:2px solid #D4AF37 !important;
                background:rgba(212,175,55,0.08) !important;
            }
            .cms-img-editable {
                outline:3px dashed rgba(59,130,246,0.6) !important;
                outline-offset:2px !important;
                cursor:pointer !important;
                transition:all 0.2s !important;
            }
            .cms-img-editable:hover {
                outline-color:#3b82f6 !important;
                filter:brightness(1.1) !important;
            }
            .cms-img-badge {
                position:absolute; top:6px; left:6px;
                background:rgba(59,130,246,0.9); color:#fff;
                font-size:0.62rem; font-weight:700; padding:2px 6px;
                border-radius:4px; pointer-events:none; z-index:10;
                font-family:'Inter',sans-serif;
            }
            .cms-text-badge {
                position:absolute; top:-18px; left:0;
                background:rgba(212,175,55,0.95); color:#0f172a;
                font-size:0.6rem; font-weight:800; padding:2px 6px;
                border-radius:4px 4px 0 0; pointer-events:none; z-index:100;
                font-family:'Inter',sans-serif; white-space:nowrap;
                display:none;
            }
            .cms-editable:hover > .cms-text-badge,
            .cms-editable:focus-within > .cms-text-badge { display:block; }

            /* Popup */
            #kr-cms-popup {
                position:fixed; inset:0; z-index:999999;
                background:rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center;
                backdrop-filter:blur(5px); font-family:'Inter',sans-serif;
            }
            #kr-cms-popup .pop-box {
                background:#fff; border-radius:20px; padding:2rem;
                width:90%; max-width:480px; position:relative;
                box-shadow:0 25px 80px rgba(0,0,0,0.4);
            }
            #kr-cms-popup h3 { font-size:1.15rem; color:#0f172a; margin-bottom:1rem; font-weight:800; }
            #kr-cms-popup input, #kr-cms-popup textarea, #kr-cms-popup select {
                width:100%; padding:0.65rem 0.9rem; border:1.5px solid #e2e8f0;
                border-radius:8px; font-size:0.9rem; font-family:'Inter',sans-serif;
                outline:none; margin-bottom:0.75rem; resize:vertical;
            }
            #kr-cms-popup input:focus, #kr-cms-popup textarea:focus,
            #kr-cms-popup select:focus { border-color:#8B1538; }
            #kr-cms-popup label { font-size:0.78rem; font-weight:600; color:#64748b; display:block; margin-bottom:0.25rem; }
            #kr-cms-popup .pop-actions { display:flex; gap:0.75rem; justify-content:flex-end; margin-top:0.5rem; }
            #kr-cms-popup .pop-btn { padding:0.6rem 1.25rem; border-radius:8px; font-size:0.875rem; font-weight:700; cursor:pointer; border:none; font-family:'Inter',sans-serif; transition:0.2s; }
            #kr-cms-popup .pop-primary { background:#8B1538; color:#fff; }
            #kr-cms-popup .pop-primary:hover { background:#6e102b; }
            #kr-cms-popup .pop-cancel { background:#f1f5f9; color:#334155; border:1px solid #e2e8f0; }
            #kr-cms-popup .pop-cancel:hover { background:#e2e8f0; }
            #kr-cms-popup .pop-close { position:absolute; top:1rem; right:1rem; background:none; border:none; font-size:1.25rem; cursor:pointer; color:#94a3b8; }
            #kr-cms-popup .color-row { display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.75rem; }
            #kr-cms-popup .color-chip { width:28px; height:28px; border-radius:50%; cursor:pointer; border:2px solid transparent; transition:0.2s; }
            #kr-cms-popup .color-chip.active { border-color:#0f172a; transform:scale(1.2); }

            /* Toast */
            #kr-toast {
                position:fixed; bottom:1.5rem; left:50%; transform:translateX(-50%) translateY(80px);
                background:#1e293b; color:#fff; padding:0.7rem 1.5rem; border-radius:10px;
                font-size:0.85rem; font-weight:600; font-family:'Inter',sans-serif;
                z-index:999998; transition:transform 0.3s ease;
                box-shadow:0 8px 24px rgba(0,0,0,0.3); white-space:nowrap;
            }
            #kr-toast.show { transform:translateX(-50%) translateY(0); }
            #kr-toast.success { border-left:4px solid #10b981; }
            #kr-toast.error   { border-left:4px solid #ef4444; }
            #kr-toast.info    { border-left:4px solid #D4AF37; }

            /* Upload drop zone in popup */
            .cms-drop-zone {
                border:2px dashed #cbd5e1; border-radius:10px; padding:2rem;
                text-align:center; cursor:pointer; transition:0.2s; background:#f8fafc;
                margin-bottom:0.75rem;
            }
            .cms-drop-zone:hover, .cms-drop-zone.drag { border-color:#8B1538; background:#fff5f7; }
            .cms-drop-zone i { font-size:2rem; color:#cbd5e1; display:block; margin-bottom:0.5rem; }

            /* Push page body down when bar is present */
            body.cms-active { margin-top: 42px !important; }
        `;
        document.head.appendChild(style);

        // Build toolbar HTML
        const bar = document.createElement('div');
        bar.id = 'kr-cms-bar';
        const pageName = document.querySelector('title')?.textContent || window.location.pathname;
        bar.innerHTML = `
            <div class="cms-logo"><span>👑</span> Admin Mode</div>
            <div class="cms-page-name">📄 ${pageName}</div>
            <div class="cms-btns">
                <button class="cms-btn" id="cms-edit-btn" onclick="window._cms.toggleEdit()">
                    ✏️ Edit Mode
                </button>
                <div class="cms-sep"></div>
                <button class="cms-btn" onclick="window._cms.openAnnounce()">📢 Announcement</button>
                <button class="cms-btn" onclick="window._cms.openUpload()">🖼️ Upload Photo</button>
                <button class="cms-btn" onclick="window._cms.openAddContent()">➕ Add Content</button>
                <div class="cms-sep"></div>
                <button class="cms-btn success" id="cms-save-btn" onclick="window._cms.saveAll()" style="display:none">
                    💾 Save Changes
                </button>
                <button class="cms-btn danger" id="cms-discard-btn" onclick="window._cms.discardAll()" style="display:none">
                    ↩️ Discard
                </button>
            </div>
            <div class="cms-right">
                <span class="cms-user">👤 admin</span>
                <button class="cms-btn" onclick="window.location.href='admin.html'" title="Full Dashboard">
                    ⚙️ Dashboard
                </button>
                <button class="cms-btn danger" onclick="window._cms.exitAdmin()">🚪 Exit</button>
            </div>
        `;
        document.body.prepend(bar);
        document.body.classList.add('cms-active');

        // Inject toast element
        const toast = document.createElement('div');
        toast.id = 'kr-toast';
        document.body.appendChild(toast);

        // Hidden file input for uploads
        const fileInp = document.createElement('input');
        fileInp.type = 'file'; fileInp.accept = 'image/*';
        fileInp.style.display = 'none'; fileInp.id = 'kr-cms-file-inp';
        document.body.appendChild(fileInp);

        // Expose CMS API globally
        window._cms = {
            toggleEdit, saveAll, discardAll, exitAdmin,
            openAnnounce, openUpload, openAddContent, showToast
        };
    }

    /* ═══════════════════════════════════════════════
       EDIT MODE
    ═══════════════════════════════════════════════ */
    function toggleEditMode() { toggleEdit(); }

    function toggleEdit() {
        editMode = !editMode;
        const btn = document.getElementById('cms-edit-btn');
        const saveBtn = document.getElementById('cms-save-btn');
        const discardBtn = document.getElementById('cms-discard-btn');

        if (editMode) {
            btn.classList.add('edit-on');
            btn.textContent = '✅ Editing Live';
            if (saveBtn) { saveBtn.style.display = 'inline-flex'; }
            if (discardBtn) { discardBtn.style.display = 'inline-flex'; }
            activateEditMode();
            showToast('✏️ Click any highlighted element to edit it', 'info');
        } else {
            btn.classList.remove('edit-on');
            btn.textContent = '✏️ Edit Mode';
            if (saveBtn) { saveBtn.style.display = 'none'; }
            if (discardBtn) { discardBtn.style.display = 'none'; }
            deactivateEditMode();
        }
    }

    function activateEditMode() {
        // Text elements with data-cms-key
        document.querySelectorAll('[data-cms-key]').forEach(el => {
            const key = el.dataset.cmsKey;
            const type = el.dataset.cmsType || (el.tagName === 'IMG' ? 'image' : 'text');

            if (type === 'image' || el.tagName === 'IMG') {
                el.classList.add('cms-img-editable');
                el.title = 'Click to replace image';
                // Add "click to replace" badge
                if (el.style.position !== 'absolute') el.style.position = 'relative';
                let badge = el.parentElement.querySelector('.cms-img-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'cms-img-badge';
                    badge.textContent = '🖼 Click to Replace';
                    el.parentElement.style.position = 'relative';
                    el.parentElement.appendChild(badge);
                }
                el._cmsClickHandler = () => pickImageForKey(key, el);
                el.addEventListener('click', el._cmsClickHandler);
            } else {
                el.classList.add('cms-editable');
                el.contentEditable = 'true';
                // Tooltip badge
                let badge = el.querySelector('.cms-text-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'cms-text-badge';
                    badge.textContent = '✏ ' + (el.dataset.cmsLabel || key);
                    el.style.position = 'relative';
                    el.prepend(badge);
                }
                el.addEventListener('input', () => {
                    changes[key] = { value: el.innerHTML, type: 'text', label: el.dataset.cmsLabel || key };
                    markUnsaved();
                });
            }
        });

        // Auto-detect: h1, h2, h3, p with significant text (no data-cms-key — offer to tag them)
        showToast('📝 Elements with gold outline are editable. Blue = images.', 'info', 5000);
    }

    function deactivateEditMode() {
        document.querySelectorAll('.cms-editable').forEach(el => {
            el.classList.remove('cms-editable');
            el.contentEditable = 'false';
            el.querySelectorAll('.cms-text-badge').forEach(b => b.remove());
        });
        document.querySelectorAll('.cms-img-editable').forEach(el => {
            el.classList.remove('cms-img-editable');
            el.removeEventListener('click', el._cmsClickHandler);
        });
        document.querySelectorAll('.cms-img-badge').forEach(b => b.remove());
    }

    function markUnsaved() {
        const saveBtn = document.getElementById('cms-save-btn');
        if (saveBtn) {
            saveBtn.textContent = `💾 Save Changes (${Object.keys(changes).length})`;
        }
    }

    /* ═══════════════════════════════════════════════
       IMAGE PICKER
    ═══════════════════════════════════════════════ */
    function pickImageForKey(key, imgEl) {
        const inp = document.getElementById('kr-cms-file-inp');
        if (!inp) return;
        inp.onchange = null;
        inp.click();
        inp.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const b64 = await fileToBase64(file);
            // Preview immediately
            imgEl.src = b64;
            // Save to changes
            changes[key] = { value: b64, type: 'image', label: key };
            markUnsaved();
            showToast('🖼️ Image updated! Click "Save Changes" to commit.', 'success');
            // Also upload to server immediately
            uploadImageToServer(b64, file.name, key);
            inp.value = '';
        };
    }

    async function uploadImageToServer(b64, filename, cmsKey) {
        try {
            const r = await fetch('/api/admin/upload-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Key': ADMIN_KEY,
                    'X-Admin-Session': sessionStorage.getItem(SESSION_KEY) || ''
                },
                body: JSON.stringify({ base64data: b64, filename, cmsKey: cmsKey || undefined })
            });
            const d = await r.json();
            if (d.success && d.imageUrl) {
                // Update the change to use the server URL instead of base64
                if (cmsKey) changes[cmsKey] = { ...(changes[cmsKey]||{}), value: d.imageUrl, type: 'image' };
                showToast(`✅ Photo saved to server!`, 'success');
                return d.imageUrl;
            } else {
                showToast('⚠️ Upload failed: ' + (d.message || 'unknown error'), 'error');
            }
        } catch (e) {
            showToast('⚠️ Server offline — image stored locally only', 'info');
        }
        return null;
    }

    /* ═══════════════════════════════════════════════
       SAVE / DISCARD
    ═══════════════════════════════════════════════ */
    async function saveAll() {
        if (Object.keys(changes).length === 0) {
            showToast('No changes to save.', 'info');
            return;
        }

        // Save to localStorage immediately (offline-first)
        const local = getLocalContent();
        Object.assign(local, changes);
        localStorage.setItem(LS_CONTENT, JSON.stringify(local));

        // Save each change to server
        let serverOk = 0;
        const session = sessionStorage.getItem(SESSION_KEY) || '';
        for (const [key, item] of Object.entries(changes)) {
            try {
                const r = await fetch('/api/admin/content', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Admin-Key': ADMIN_KEY,
                        'X-Admin-Session': session
                    },
                    body: JSON.stringify({ key, value: item.value, type: item.type, label: item.label || key })
                });
                const d = await r.json();
                if (d.success) serverOk++;
            } catch (e) { /* offline */ }
        }

        showToast(`✅ ${Object.keys(changes).length} change(s) saved!${serverOk === 0 ? ' (offline — saved locally)' : ''}`, 'success', 4000);
        changes = {};
        markUnsaved();
        if (editMode) toggleEdit(); // Exit edit mode after save
    }

    function discardAll() {
        if (!Object.keys(changes).length && confirm('Exit edit mode?') || Object.keys(changes).length && confirm(`Discard ${Object.keys(changes).length} change(s)?`)) {
            changes = {};
            // Re-apply saved content (restore discarded changes)
            applyPageContent();
            if (editMode) toggleEdit();
            showToast('↩️ Changes discarded', 'info');
        }
    }

    /* ═══════════════════════════════════════════════
       ANNOUNCEMENT POPUP
    ═══════════════════════════════════════════════ */
    const ANNOUNCE_COLORS = [
        { bg:'#8B1538', end:'#c02050', label:'Burgundy' },
        { bg:'#1e40af', end:'#2563eb', label:'Blue' },
        { bg:'#065f46', end:'#059669', label:'Green' },
        { bg:'#7c3aed', end:'#8b5cf6', label:'Purple' },
        { bg:'#b45309', end:'#d97706', label:'Amber' },
        { bg:'#0f172a', end:'#1e293b', label:'Dark' },
    ];

    function openAnnounce() {
        const ann = getAnnouncement() || {};
        let selectedColor = 0;

        showPopup({
            title: '📢 Site-Wide Announcement',
            html: `
                <div id="ann-preview" style="border-radius:8px;padding:0.6rem 1rem;margin-bottom:0.75rem;background:${ann.color||ANNOUNCE_COLORS[0].bg};color:#fff;font-size:0.85rem;font-weight:600;text-align:center;">
                    ${ann.text||'Your announcement text here 🎉'}
                </div>
                <label>Announcement Text</label>
                <textarea id="ann-text" rows="2" placeholder="e.g. 🎉 Sale ON! Up to 50% off all sarees this week">${ann.text||''}</textarea>
                <label>Emoji / Icon</label>
                <input type="text" id="ann-emoji" value="${ann.emoji||'📢'}" placeholder="📢" style="width:80px;display:inline;margin-right:0.5rem">
                <label style="display:inline">Optional Link</label>
                <input type="text" id="ann-link" value="${ann.link||''}" placeholder="https://... (optional)">
                <input type="text" id="ann-link-text" value="${ann.linkText||'Shop Now'}" placeholder="Link button text">
                <label>Banner Color</label>
                <div class="color-row">
                    ${ANNOUNCE_COLORS.map((c,i) => `<div class="color-chip ${ann.color===c.bg?'active':''}" style="background:${c.bg}" title="${c.label}" onclick="window._cmsAnnColor(${i},this)"></div>`).join('')}
                </div>
                <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.5rem">
                    <input type="checkbox" id="ann-enabled" ${ann.enabled!==false?'checked':''} style="width:auto;margin:0">
                    <label for="ann-enabled" style="margin:0;font-weight:700;color:#0f172a">Show announcement to all visitors</label>
                </div>
            `,
            onConfirm: () => {
                const data = {
                    text: document.getElementById('ann-text').value.trim(),
                    emoji: document.getElementById('ann-emoji').value.trim(),
                    link: document.getElementById('ann-link').value.trim(),
                    linkText: document.getElementById('ann-link-text').value.trim()||'Shop Now',
                    color: ANNOUNCE_COLORS[selectedColor].bg,
                    colorEnd: ANNOUNCE_COLORS[selectedColor].end,
                    enabled: document.getElementById('ann-enabled').checked,
                    updatedAt: new Date().toISOString()
                };
                localStorage.setItem(LS_ANNOUNCE, JSON.stringify(data));
                // Save to server too
                saveToServer('kr_announcement', JSON.stringify(data), 'json', 'Site Announcement');
                applyAnnouncement();
                showToast(data.enabled ? '📢 Announcement is now live on all pages!' : '⏸ Announcement hidden', 'success', 4000);
            }
        });

        // Expose color selection helper
        window._cmsAnnColor = (idx, el) => {
            selectedColor = idx;
            document.querySelectorAll('#kr-cms-popup .color-chip').forEach(c => c.classList.remove('active'));
            el.classList.add('active');
            const preview = document.getElementById('ann-preview');
            if (preview) {
                preview.style.background = ANNOUNCE_COLORS[idx].bg;
                preview.textContent = document.getElementById('ann-text')?.value || 'Preview';
            }
        };

        // Live preview on text input
        setTimeout(() => {
            const textArea = document.getElementById('ann-text');
            if (textArea) {
                textArea.addEventListener('input', () => {
                    const preview = document.getElementById('ann-preview');
                    if (preview) preview.textContent = textArea.value || 'Preview';
                });
            }
        }, 100);
    }

    /* ═══════════════════════════════════════════════
       PHOTO UPLOAD POPUP
    ═══════════════════════════════════════════════ */
    function openUpload() {
        let selectedFile = null;

        showPopup({
            title: '🖼️ Upload New Photo',
            html: `
                <div class="cms-drop-zone" id="cms-dz" onclick="document.getElementById('kr-cms-file-inp2').click()" ondragover="event.preventDefault();this.classList.add('drag')" ondragleave="this.classList.remove('drag')" ondrop="window._cmsDrop(event)">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <p style="font-size:0.88rem;color:#64748b">Drag & drop or <strong style="color:#8B1538">browse</strong></p>
                    <p style="font-size:0.75rem;color:#94a3b8;margin-top:0.25rem">JPG, PNG, WebP — max 8MB</p>
                </div>
                <input type="file" id="kr-cms-file-inp2" accept="image/*" style="display:none" onchange="window._cmsFilePreview(this)">
                <div id="cms-upload-preview" style="display:none;text-align:center">
                    <img id="cms-prev-img" style="max-height:160px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:0.5rem">
                </div>
                <label>File Name (optional)</label>
                <input type="text" id="cms-upload-name" placeholder="e.g. hero-banner-2026">
                <label>Tag (CMS Key — to link to a page element)</label>
                <input type="text" id="cms-upload-key" placeholder="e.g. hero_image (optional)">
            `,
            confirmText: '📤 Upload',
            onConfirm: async () => {
                if (!selectedFile) { showToast('Please select a file first', 'error'); return false; }
                const b64 = await fileToBase64(selectedFile);
                const filename = document.getElementById('cms-upload-name').value.trim() || selectedFile.name;
                const key = document.getElementById('cms-upload-key').value.trim();
                await uploadImageToServer(b64, filename, key || null);
                if (key) {
                    // Apply to page element immediately
                    const el = document.querySelector(`[data-cms-key="${key}"]`);
                    if (el && el.tagName === 'IMG') el.src = b64;
                }
                showToast('🖼️ Photo uploaded!', 'success');
            }
        });

        window._cmsFilePreview = (inp) => {
            const f = inp.files[0]; if (!f) return;
            selectedFile = f;
            const preview = document.getElementById('cms-upload-preview');
            const img = document.getElementById('cms-prev-img');
            const reader = new FileReader();
            reader.onload = ev => { img.src = ev.target.result; preview.style.display='block'; };
            reader.readAsDataURL(f);
            document.getElementById('cms-dz').style.display = 'none';
        };
        window._cmsDrop = (ev) => {
            ev.preventDefault();
            const f = ev.dataTransfer.files[0];
            if (!f) return;
            selectedFile = f;
            const dt = new DataTransfer(); dt.items.add(f);
            const inp2 = document.getElementById('kr-cms-file-inp2');
            if (inp2) { inp2.files = dt.files; window._cmsFilePreview(inp2); }
            document.getElementById('cms-dz').classList.remove('drag');
        };
    }

    /* ═══════════════════════════════════════════════
       ADD CONTENT KEY POPUP
    ═══════════════════════════════════════════════ */
    function openAddContent() {
        // Show all existing content keys for reference
        const content = getLocalContent();
        const existingKeys = Object.keys(content);

        showPopup({
            title: '➕ Add / Edit Website Content',
            html: `
                <p style="font-size:0.82rem;color:#64748b;margin-bottom:0.75rem">
                    Content keys link to elements on the page via <code>data-cms-key</code> attributes.
                </p>
                <label>Content Key <span style="color:#8B1538">*</span></label>
                <input type="text" id="add-key" placeholder="e.g. hero_title, promo_text" list="cms-key-list">
                <datalist id="cms-key-list">
                    ${existingKeys.map(k=>`<option value="${k}">`).join('')}
                </datalist>
                <label>Label (friendly name)</label>
                <input type="text" id="add-label" placeholder="e.g. Hero Title">
                <label>Content Value <span style="color:#8B1538">*</span></label>
                <textarea id="add-value" rows="3" placeholder="Enter text, HTML, or image URL..."></textarea>
                <label>Type</label>
                <select id="add-type">
                    <option value="text">Text / HTML</option>
                    <option value="image">Image URL</option>
                    <option value="json">JSON Data</option>
                </select>
                ${existingKeys.length ? `
                <div style="margin-top:0.75rem;background:#f8fafc;border-radius:8px;padding:0.75rem;max-height:140px;overflow-y:auto">
                    <div style="font-size:0.72rem;font-weight:700;color:#94a3b8;margin-bottom:0.4rem">EXISTING KEYS</div>
                    ${existingKeys.map(k=>`
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:0.2rem 0;border-bottom:1px solid #e2e8f0;font-size:0.8rem">
                        <code style="color:#8B1538">${k}</code>
                        <span style="color:#64748b;overflow:hidden;text-overflow:ellipsis;max-width:200px;white-space:nowrap">${(content[k]?.value||'').substring(0,40)}</span>
                        <button onclick="document.getElementById('add-key').value='${k}';document.getElementById('add-value').value=${JSON.stringify(content[k]?.value||'')};" style="background:#e2e8f0;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:0.72rem">Edit</button>
                    </div>`).join('')}
                </div>` : ''}
            `,
            confirmText: '💾 Save',
            onConfirm: async () => {
                const key   = document.getElementById('add-key').value.trim();
                const label = document.getElementById('add-label').value.trim();
                const value = document.getElementById('add-value').value.trim();
                const type  = document.getElementById('add-type').value;
                if (!key || !value) { showToast('Key and Value are required', 'error'); return false; }
                // Save locally
                const local = getLocalContent();
                local[key] = { value, type, label: label || key };
                localStorage.setItem(LS_CONTENT, JSON.stringify(local));
                // Apply to DOM
                const el = document.querySelector(`[data-cms-key="${key}"]`);
                if (el) {
                    if (type === 'image' && el.tagName === 'IMG') el.src = value;
                    else el.innerHTML = value;
                }
                // Save to server
                await saveToServer(key, value, type, label || key);
                showToast(`✅ Content "${key}" saved!`, 'success', 3000);
                applyPageContent();
            }
        });
    }

    /* ═══════════════════════════════════════════════
       SERVER SAVE HELPER
    ═══════════════════════════════════════════════ */
    async function saveToServer(key, value, type, label) {
        try {
            const r = await fetch('/api/admin/content', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Key': ADMIN_KEY,
                    'X-Admin-Session': sessionStorage.getItem(SESSION_KEY) || ''
                },
                body: JSON.stringify({ key, value, type: type || 'text', label: label || key })
            });
            return await r.json();
        } catch (e) { return null; }
    }

    /* ═══════════════════════════════════════════════
       ADMIN LOGIN POPUP (via keyboard shortcut)
    ═══════════════════════════════════════════════ */
    function showLoginPopup() {
        showPopup({
            title: '🔐 Admin Login',
            html: `
                <div style="text-align:center;margin-bottom:1rem">
                    <span style="font-size:2rem">👑</span>
                    <p style="font-size:0.82rem;color:#64748b">Kashi Rivaz — Admin Access</p>
                </div>
                <label>Username</label>
                <input type="text" id="al-user" placeholder="admin" autocomplete="username">
                <label>Password</label>
                <input type="password" id="al-pass" placeholder="••••••••" autocomplete="current-password">
                <div id="al-err" style="color:#ef4444;font-size:0.82rem;display:none;padding:0.5rem;background:#fff5f5;border-radius:6px"></div>
                <p style="font-size:0.72rem;color:#94a3b8;margin-top:0.5rem">
                    💡 Tip: Press Ctrl+Shift+A on any page to open admin login
                </p>
            `,
            confirmText: '🔐 Login',
            onConfirm: async () => {
                const user = document.getElementById('al-user').value.trim();
                const pass = document.getElementById('al-pass').value;
                const errEl = document.getElementById('al-err');

                // Try server
                let ok = false;
                try {
                    const r = await fetch('/api/admin/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: user, password: pass }),
                        signal: AbortSignal.timeout(4000)
                    });
                    const d = await r.json();
                    if (d.success) {
                        sessionStorage.setItem(SESSION_KEY, d.sessionToken);
                        ok = true;
                    } else {
                        if (errEl) { errEl.textContent = d.message || 'Invalid credentials'; errEl.style.display='block'; }
                        return false;
                    }
                } catch (e) {
                    // Offline fallback
                    if (user === FALLBACK_USER && pass === FALLBACK_PASS) {
                        sessionStorage.setItem(SESSION_KEY, 'offline_' + Date.now());
                        ok = true;
                    } else {
                        if (errEl) { errEl.textContent = 'Wrong credentials (server offline)'; errEl.style.display='block'; }
                        return false;
                    }
                }

                if (ok) {
                    isAdmin = true;
                    closePopup();
                    injectToolbar();
                    fetchServerContent();
                    showToast('✅ Admin mode activated! Press Ctrl+Shift+A to edit.', 'success', 5000);
                }
            }
        });

        // Enter key
        setTimeout(() => {
            document.getElementById('al-pass')?.addEventListener('keydown', e => {
                if (e.key === 'Enter') document.getElementById('cms-pop-confirm')?.click();
            });
        }, 100);
    }

    /* ═══════════════════════════════════════════════
       EXIT ADMIN
    ═══════════════════════════════════════════════ */
    function exitAdmin() {
        if (Object.keys(changes).length && !confirm('You have unsaved changes. Exit anyway?')) return;
        if (editMode) deactivateEditMode();
        sessionStorage.removeItem(SESSION_KEY);
        const bar = document.getElementById('kr-cms-bar');
        if (bar) bar.remove();
        document.body.classList.remove('cms-active');
        document.body.style.marginTop = '';
        isAdmin = false; editMode = false;
        showToast('Admin mode exited.', 'info');
    }

    /* ═══════════════════════════════════════════════
       POPUP SYSTEM
    ═══════════════════════════════════════════════ */
    function showPopup({ title, html, confirmText = '✅ Confirm', onConfirm }) {
        closePopup();
        const overlay = document.createElement('div');
        overlay.id = 'kr-cms-popup';
        overlay.innerHTML = `
            <div class="pop-box">
                <button class="pop-close" onclick="window._cms_closePopup()">✕</button>
                <h3>${title}</h3>
                <div id="pop-content">${html}</div>
                <div class="pop-actions">
                    <button class="pop-btn pop-cancel" onclick="window._cms_closePopup()">Cancel</button>
                    <button class="pop-btn pop-primary" id="cms-pop-confirm">${confirmText}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) closePopup(); });

        document.getElementById('cms-pop-confirm').onclick = async () => {
            const result = await onConfirm();
            if (result !== false) closePopup();
        };

        window._cms_closePopup = closePopup;
    }

    function closePopup() {
        const el = document.getElementById('kr-cms-popup');
        if (el) el.remove();
    }

    /* ═══════════════════════════════════════════════
       TOAST
    ═══════════════════════════════════════════════ */
    let toastTimer;
    function showToast(msg, type = 'success', duration = 3000) {
        let el = document.getElementById('kr-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'kr-toast';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.className = type;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), duration);
    }

    /* ═══════════════════════════════════════════════
       HELPERS
    ═══════════════════════════════════════════════ */
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = e => resolve(e.target.result);
            r.onerror = reject;
            r.readAsDataURL(file);
        });
    }
})();
