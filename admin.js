/**
 * Dr. Alaa Al-Kubaisi Clinic — Gallery Admin Dashboard
 * Authenticated CRUD against Supabase (table `gallery` + bucket `gallery-images`).
 */
(function () {
    'use strict';

    if (!window.GalleryAPI) {
        console.error('gallery-api.js must be loaded before admin.js');
        return;
    }

    var api = window.GalleryAPI;
    var state = {
        items: [],
        editingId: null,
        currentFile: null,
        hasUpload: false
    };

    var el = function (id) { return document.getElementById(id); };

    // ===== AUTH =====
    function showLogin() {
        el('login-view').style.display = 'flex';
        var app = el('admin-app');
        app.classList.remove('visible');
        document.title = 'تسجيل الدخول | إدارة المعرض';
    }

    function showApp(email) {
        el('login-view').style.display = 'none';
        el('admin-app').classList.add('visible');
        if (email) {
            el('admin-email').textContent = email.split('@')[0];
            el('admin-avatar').textContent = (email[0] || 'م').toUpperCase();
        }
        document.title = 'إدارة معرض الصور | عيادة د. آلاء الكبيسي';
        loadItems();
    }

    async function handleSession() {
        var session;
        try {
            var res = await api.client.auth.getSession();
            session = res.data.session;
        } catch (e) {
            console.error(e);
        }
        if (session) showApp(session.user.email);
        else showLogin();
    }

    function resetLoginButton() {
        var submit = el('login-submit');
        if (!submit) return;
        submit.disabled = false;
        el('login-submit-label').textContent = 'دخول';
    }

    function initAuth() {
        var form = el('login-form');
        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            var email = el('login-email').value.trim();
            var password = el('login-password').value;
            var errBox = el('login-error');
            var submit = el('login-submit');
            errBox.classList.remove('visible');
            if (!email || !password) {
                errBox.textContent = 'يرجى إدخال البريد الإلكتروني وكلمة المرور.';
                errBox.classList.add('visible');
                return;
            }
            submit.disabled = true;
            el('login-submit-label').textContent = 'جارٍ الدخول…';
            try {
                var res = await api.client.auth.signInWithPassword({ email: email, password: password });
                if (res.error) throw res.error;
            } catch (err) {
                errBox.textContent = (err && err.message) || 'تعذر تسجيل الدخول. تحقق من البيانات.';
                errBox.classList.add('visible');
                submit.disabled = false;
                el('login-submit-label').textContent = 'دخول';
            }
        });

        api.client.auth.onAuthStateChange(function (event, session) {
            if (event === 'SIGNED_OUT') {
                state.items = [];
                resetLoginButton();
                showLogin();
            } else if (event === 'SIGNED_IN' && session) {
                resetLoginButton();
                showApp(session.user.email);
            } else if (event === 'TOKEN_REFRESHED') {
                resetLoginButton();
            }
        });

        el('logout-btn').addEventListener('click', function () {
            api.client.auth.signOut().catch(function (err) { console.error(err); });
        });

        handleSession();
    }

    // ===== LOAD + RENDER =====
    function renderSkeletons() {
        var grid = el('admin-grid');
        grid.innerHTML = '';
        for (var i = 0; i < 6; i++) {
            var s = document.createElement('div');
            s.className = 'skeleton-card';
            s.innerHTML =
                '<div class="skeleton-media"></div>' +
                '<div class="skeleton-line"></div>' +
                '<div class="skeleton-line short"></div>';
            grid.appendChild(s);
        }
    }

    function fmtDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        var opts = { year: 'numeric', month: 'short', day: 'numeric' };
        return d.toLocaleDateString('ar-IQ', opts);
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function renderItems() {
        renderGridFromList(state.items, '');
    }

    function updateStats() {
        el('stat-total').textContent = String(state.items.length);
        el('stat-tall').textContent = String(state.items.filter(function (i) { return i.is_tall; }).length);
    }

    async function loadItems() {
        renderSkeletons();
        el('empty-hint').classList.remove('visible');
        try {
            var items = await api.list();
            state.items = items;
            renderItems();
        } catch (err) {
            console.error(err);
            el('admin-grid').innerHTML = '';
            var hint = el('empty-hint');
            hint.classList.add('visible');
            hint.querySelector('#empty-hint-text').textContent = 'تعذر تحميل المعرض من Supabase. أعد المحاولة.';
            toast('error', 'تعذر تحميل الصور: ' + (err.message || 'خطأ غير معروف'));
        }
    }

    // ===== SEARCH =====
    function normalizeArabic(s) {
        return String(s || '')
            .replace(/[\u064B-\u0652]/g, '')
            .replace(/[أإآ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function applySearch() {
        var q = normalizeArabic(el('search-input').value);
        var clear = el('search-clear');
        clear.classList.toggle('visible', !!q);

        var visibleItems = state.items.filter(function (item) {
            if (!q) return true;
            var hay = normalizeArabic((item.label || '') + ' ' + (item.description || ''));
            return hay.indexOf(q) !== -1;
        });

        renderGridFromList(visibleItems, q);
    }

    function renderGridFromList(items, q) {
        var grid = el('admin-grid');
        grid.innerHTML = '';
        var wasFiltering = !!q;
        if (items.length === 0) {
            var hint = el('empty-hint');
            hint.classList.add('visible');
            hint.querySelector('#empty-hint-text').textContent = wasFiltering
                ? 'لا توجد نتائج مطابقة للبحث.'
                : 'لا توجد صور بعد. ابدأ بإضافة أول صورة للمعرض.';
            return;
        }
        el('empty-hint').classList.remove('visible');

        items.forEach(function (item, index) {
            cardFor(items, item, index, grid);
        });
        updateStats();
    }

    function cardFor(items, item, index, grid) {
        var card = document.createElement('div');
        card.className = 'card';
        card.dataset.id = item.id;
        card.style.animationDelay = Math.min(index * 40, 400) + 'ms';

        var tallBadge = item.is_tall
            ? '<span class="card-badge tall">' + esc(item.label) + ' · مميزة</span>'
            : '<span class="card-badge">' + esc(item.label) + '</span>';

        var moveUp = index === 0;
        var moveDown = index === items.length - 1;

        card.innerHTML =
            '<div class="card-media">' +
                '<img src="' + esc(item.url) + '" alt="' + esc(item.label) + '" loading="lazy" decoding="async">' +
                tallBadge +
            '</div>' +
            '<div class="card-body">' +
                '<h3 class="card-label">' + esc(item.label || 'بدون تسمية') + '</h3>' +
                '<p class="card-desc">' + esc(item.description || 'لا يوجد وصف') + '</p>' +
                '<div class="card-meta">' +
                    '<span class="mat-icon">schedule</span>' +
                    '<span>' + fmtDate(item.updated_at || item.created_at) + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="card-actions">' +
                '<button type="button" class="icon-btn" data-action="move-up" title="تحريك لأعلى" ' + (moveUp ? 'disabled' : '') + ' aria-label="تحريك لأعلى"><span class="mat-icon">arrow_upward</span></button>' +
                '<button type="button" class="icon-btn" data-action="move-down" title="تحريك لأسفل" ' + (moveDown ? 'disabled' : '') + ' aria-label="تحريك لأسفل"><span class="mat-icon">arrow_downward</span></button>' +
                '<button type="button" class="icon-btn gold" data-action="toggle-tall" title="تبديل الحجم المميز" aria-label="تبديل الحجم المميز"><span class="mat-icon">' + (item.is_tall ? 'star' : 'star_border') + '</span></button>' +
            '</div>' +
            '<div class="card-actions">' +
                '<button type="button" class="icon-btn" data-action="edit" title="تعديل الوصف / استبدال الصورة" aria-label="تعديل"><span class="mat-icon">edit</span></button>' +
                '<button type="button" class="icon-btn danger" data-action="delete" title="حذف" aria-label="حذف"><span class="mat-icon">delete</span></button>' +
            '</div>';

        grid.appendChild(card);
    }

    // ===== REORDER / TALL =====
    async function reorder(fromIndex, toIndex) {
        var items = state.items;
        if (toIndex < 0 || toIndex >= items.length) return;
        var moved = items.splice(fromIndex, 1)[0];
        items.splice(toIndex, 0, moved);
        items.forEach(function (item, i) { item.position = i + 1; });
        try {
            for (var i = 0; i < items.length; i++) {
                await api.update(items[i].id, { position: items[i].position });
            }
            toast('success', 'تم تحديث الترتيب.');
        } catch (err) {
            toast('error', 'تعذر حفظ الترتيب: ' + (err.message || 'خطأ'));
        }
        loadItems();
    }

    async function toggleTall(id) {
        var item = state.items.find(function (i) { return i.id === id; });
        if (!item) return;
        try {
            await api.update(id, { is_tall: !item.is_tall });
            toast('success', item.is_tall ? 'أُزيلت سمة التميّز.' : 'عُيّنت كصورة مميزة.');
            loadItems();
        } catch (err) {
            toast('error', 'تعذر التحديث: ' + (err.message || 'خطأ'));
        }
    }

    // ===== MODALS =====
    function openModal(id) {
        var overlay = el(id);
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        var first = overlay.querySelector('input, button, textarea');
        if (first) first.focus();
    }

    function closeModal(overlay) {
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    function closeAllModals() {
        document.querySelectorAll('.modal-overlay').forEach(closeModal);
    }

    function initModals() {
        document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay || e.target.closest('[data-close-modal]')) {
                    closeModal(overlay);
                    if (overlay.id === 'item-modal') resetItemForm();
                }
            });
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeAllModals();
        });
    }

    // ===== ADD / EDIT FORM =====
    function resetItemForm() {
        state.editingId = null;
        state.currentFile = null;
        state.hasUpload = false;
        el('item-form').reset();
        el('item-form-error').classList.remove('visible');
        el('item-submit-label').textContent = 'إضافة';
        el('item-submit-icon').textContent = 'add';
        el('item-modal-title').textContent = 'إضافة صورة جديدة';
        el('item-modal-sub').textContent = 'سيتم رفع الصورة إلى Supabase Storage وربطها بالسجل';
        el('file-req').style.display = '';
        el('dropzone').classList.remove('has-preview');
        el('preview-img').removeAttribute('src');
        el('preview-name').textContent = '';
    }

    function openAddModal() {
        resetItemForm();
        openModal('item-modal');
    }

    function openEditModal(id) {
        var item = state.items.find(function (i) { return i.id === id; });
        if (!item) return;
        resetItemForm();
        state.editingId = id;
        el('item-label').value = item.label || '';
        el('item-desc').value = item.description || '';
        el('item-tall').checked = !!item.is_tall;
        el('item-submit-label').textContent = 'حفظ التعديلات';
        el('item-submit-icon').textContent = 'save';
        el('item-modal-title').textContent = 'تعديل الصورة';
        el('item-modal-sub').textContent = 'حدّث الوصف أو استبدل الصورة، ثم احفظ التغييرات';
        el('file-req').style.display = 'none';
        el('dropzone').classList.add('has-preview');
        el('preview-img').src = item.url;
        el('preview-name').textContent = item.storage_path.split('/').pop();
        openModal('item-modal');
    }

    function initDropzone() {
        var dz = el('dropzone');
        var input = el('file-input');

        dz.addEventListener('click', function () { input.click(); });
        dz.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
        });
        input.addEventListener('change', function () { handleFile(input.files[0]); });

        ['dragenter', 'dragover'].forEach(function (ev) {
            dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('dragover'); });
        });
        ['dragleave', 'drop'].forEach(function (ev) {
            dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('dragover'); });
        });
        dz.addEventListener('drop', function (e) {
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) {
                input.files = e.dataTransfer.files;
                handleFile(f);
            }
        });
    }

    function handleFile(file) {
        if (!file) return;
        var allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
        if (allowed.indexOf(file.type) === -1) {
            toast('error', 'نوع الملف غير مدعوم. اختر صورة JPG أو PNG أو WebP.');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            toast('error', 'حجم الصورة يتجاوز الحد المسموح (10MB).');
            return;
        }
        state.currentFile = file;
        state.hasUpload = true;
        el('dropzone').classList.add('has-preview');
        el('preview-name').textContent = file.name;
        var reader = new FileReader();
        reader.onload = function (ev) {
            el('preview-img').src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    async function submitItemForm(e) {
        e.preventDefault();
        var errBox = el('item-form-error');
        errBox.classList.remove('visible');

        var label = el('item-label').value.trim();
        var description = el('item-desc').value.trim();
        var isTall = el('item-tall').checked;
        var submit = el('item-submit');

        if (!state.editingId && !state.currentFile) {
            errBox.textContent = 'يرجى اختيار صورة للمعرض.';
            errBox.classList.add('visible');
            return;
        }
        if (!label) {
            errBox.textContent = 'يرجى إدخال تسمية للصورة.';
            errBox.classList.add('visible');
            return;
        }

        submit.disabled = true;
        el('item-submit-label').textContent = 'جارٍ الحفظ…';

        try {
            var storagePath = null;
            if (state.currentFile) {
                var path = api.buildStoragePath('gallery', state.currentFile);
                storagePath = await api.uploadImage(state.currentFile, path);
            }

            if (state.editingId) {
                var patch = { label: label, description: description, is_tall: isTall };
                if (storagePath) patch.storage_path = storagePath;
                var prev = state.items.find(function (i) { return i.id === state.editingId; });
                await api.update(state.editingId, patch);
                if (storagePath && prev && prev.storage_path && prev.storage_path !== storagePath) {
                    api.deleteImage(prev.storage_path).catch(function () {});
                }
                toast('success', 'تم حفظ التعديلات.');
            } else {
                var position = state.items.length + 1;
                await api.create({ label: label, description: description, is_tall: isTall, storage_path: storagePath, position: position });
                toast('success', 'تمت إضافة الصورة إلى المعرض.');
            }
            closeModal(el('item-modal'));
            resetItemForm();
            loadItems();
        } catch (err) {
            console.error(err);
            errBox.textContent = (err && err.message) || 'حدث خطأ أثناء الحفظ.';
            errBox.classList.add('visible');
        } finally {
            submit.disabled = false;
            el('item-submit-label').textContent = state.editingId ? 'حفظ التعديلات' : 'إضافة';
        }
    }

    // ===== DELETE =====
    var pendingDelete = null;

    function confirmDelete(id) {
        var item = state.items.find(function (i) { return i.id === id; });
        if (!item) return;
        pendingDelete = item;
        el('confirm-text').innerHTML = 'سيتم حذف "<strong>' + esc(item.label || 'صورة') + '</strong>" نهائياً من المعرض ومن Supabase Storage.';
        openModal('confirm-modal');
    }

    async function runDelete() {
        if (!pendingDelete) return;
        var btn = el('confirm-delete-btn');
        btn.disabled = true;
        el('confirm-text').textContent = 'جارٍ الحذف…';
        try {
            await api.remove(pendingDelete.id);
            await api.deleteImage(pendingDelete.storage_path);
            toast('success', 'تم حذف الصورة.');
            closeModal(el('confirm-modal'));
            state.items = state.items.filter(function (i) { return i.id !== pendingDelete.id; });
            pendingDelete = null;
            applySearch();
        } catch (err) {
            console.error(err);
            toast('error', 'تعذر الحذف: ' + (err.message || 'خطأ'));
        } finally {
            btn.disabled = false;
        }
    }

    // ===== GRID CLICK DELEGATION =====
    function initGridActions() {
        el('admin-grid').addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            var card = btn.closest('.card');
            if (!card) return;
            var id = card.dataset.id;
            var index = state.items.findIndex(function (i) { return i.id === id; });
            var action = btn.dataset.action;

            if (action === 'move-up') reorder(index, index - 1);
            else if (action === 'move-down') reorder(index, index + 1);
            else if (action === 'toggle-tall') toggleTall(id);
            else if (action === 'edit') openEditModal(id);
            else if (action === 'delete') confirmDelete(id);
        });
    }

    // ===== TOASTS =====
    function toast(type, message) {
        var wrap = el('toast-wrap');
        var t = document.createElement('div');
        t.className = 'toast toast-' + type;
        var icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';
        t.innerHTML = '<span class="mat-icon">' + icon + '</span>' +
            '<span>' + esc(message) + '</span>';
        wrap.appendChild(t);
        requestAnimationFrame(function () { t.classList.add('show'); });
        setTimeout(function () {
            t.classList.remove('show');
            setTimeout(function () { t.remove(); }, 400);
        }, 3200);
    }

    // ===== SIDEBAR =====
    function initSidebar() {
        var app = el('admin-app');
        var toggle = el('sidebar-toggle');
        var scrim = el('sidebar-scrim');

        function setScrim(show) {
            scrim.classList.toggle('visible', show);
        }

        function closeSidebar() {
            app.classList.remove('sidebar-open');
            toggle.setAttribute('aria-expanded', 'false');
            setScrim(false);
        }

        toggle.addEventListener('click', function () {
            var open = app.classList.toggle('sidebar-open');
            toggle.setAttribute('aria-expanded', String(open));
            setScrim(open);
        });
        scrim.addEventListener('click', closeSidebar);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && app.classList.contains('sidebar-open')) closeSidebar();
        });

        document.querySelectorAll('.admin-sidebar .sidebar-link').forEach(function (link) {
            link.addEventListener('click', function () {
                closeSidebar();
            });
        });
    }

    // ===== TOOLBAR =====
    function initToolbar() {
        el('add-btn').addEventListener('click', openAddModal);
        el('refresh-btn').addEventListener('click', function () {
            toast('info', 'جارٍ التحديث…');
            loadItems();
        });

        el('search-input').addEventListener('input', applySearch);
        el('search-clear').addEventListener('click', function () {
            el('search-input').value = '';
            applySearch();
            el('search-input').focus();
        });
        document.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === '/') {
                e.preventDefault();
                el('search-input').focus();
            }
        });

        // Sidebar "add" shortcut closes drawer and opens the add modal.
        document.querySelectorAll('.admin-sidebar .sidebar-link[data-nav="add"]').forEach(function (link) {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                setTimeout(openAddModal, 150);
            });
        });
    }

    // ===== INIT =====
    function init() {
        initAuth();
        initModals();
        initDropzone();
        initGridActions();
        initSidebar();
        initToolbar();
        el('item-form').addEventListener('submit', submitItemForm);
        el('confirm-delete-btn').addEventListener('click', runDelete);
        window.addEventListener('resize', function () {
            if (window.innerWidth > 1023) el('admin-app').classList.remove('sidebar-open');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
