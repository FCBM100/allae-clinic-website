/**
 * Shared Supabase client and gallery helpers used by both the public site
 * (index.html) and the admin dashboard (admin.html).
 *
 * Requires:
 *   - gallery-config.js  (window.GALLERY_CONFIG)
 *   - @supabase/supabase-js UMD build  (window.supabase / supabase.createClient)
 */
(function (global) {
    'use strict';

    var cfg = global.GALLERY_CONFIG;
    if (!cfg) {
        throw new Error('gallery-config.js must be loaded before gallery-api.js');
    }

    var createClient = (global.supabase && global.supabase.createClient) ||
        (global.supabaseCreateClient);
    if (typeof createClient !== 'function') {
        throw new Error('@supabase/supabase-js must be loaded before gallery-api.js');
    }

    var client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true
        }
    });

    var TABLE = 'gallery';

    function publicUrl(storagePath) {
        if (!storagePath) return '';
        return client.storage.from(cfg.storageBucket).getPublicUrl(storagePath).data.publicUrl;
    }

    function sanitizeFileName(name, fallback) {
        var base = String(name || fallback || 'image');
        base = base.replace(/\.[a-zA-Z0-9]+$/, '').trim();
        base = base.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        if (!base) base = 'image';
        return base.slice(0, 60);
    }

    async function list() {
        var { data, error } = await client
            .from(TABLE)
            .select('*')
            .order('position', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: true });
        if (error) throw error;
        return (data || []).map(function (row) {
            row.url = publicUrl(row.storage_path);
            return row;
        });
    }

    async function create(item) {
        var { data, error } = await client
            .from(TABLE)
            .insert({
                label: item.label || '',
                description: item.description || '',
                storage_path: item.storage_path,
                is_tall: !!item.is_tall,
                position: item.position || 0
            })
            .select('*')
            .single();
        if (error) throw error;
        return data;
    }

    async function update(id, patch) {
        var { data, error } = await client
            .from(TABLE)
            .update(patch)
            .eq('id', id)
            .select('*')
            .single();
        if (error) throw error;
        return data;
    }

    async function remove(id) {
        var { error } = await client.from(TABLE).delete().eq('id', id);
        if (error) throw error;
    }

    async function uploadImage(file, storagePath) {
        var { data, error } = await client.storage
            .from(cfg.storageBucket)
            .upload(storagePath, file, {
                cacheControl: '3600',
                upsert: true,
                contentType: file.type || 'image/jpeg'
            });
        if (error) throw error;
        return data.path;
    }

    async function deleteImage(storagePath) {
        if (!storagePath) return;
        var { error } = await client.storage
            .from(cfg.storageBucket)
            .remove([storagePath]);
        if (error) throw error;
    }

    function buildStoragePath(fileCategory, file) {
        var ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        var name = sanitizeFileName(file.name, fileCategory);
        var ts = Date.now();
        return fileCategory + '/' + name + '-' + ts + '.' + ext;
    }

    var api = {
        client: client,
        publicUrl: publicUrl,
        list: list,
        create: create,
        update: update,
        remove: remove,
        uploadImage: uploadImage,
        deleteImage: deleteImage,
        buildStoragePath: buildStoragePath
    };

    global.GalleryAPI = api;
})(window);