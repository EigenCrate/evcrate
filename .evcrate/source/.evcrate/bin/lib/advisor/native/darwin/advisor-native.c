/*
 * advisor-native.c
 *
 * Node-API registration and lifecycle wrapper for Darwin advisor native bridge.
 *
 * ABI Version: 1
 * Node-API Version: 8
 *
 * Copyright (c) 2026 EigenCrate. Licensed under MIT.
 */

#include "advisor-native.h"

/* Error reporting */
void throw_advisor_error(napi_env env, const char *code, const char *msg) {
    napi_value err, code_val;
    napi_value msg_val;
    napi_create_string_utf8(env, msg, NAPI_AUTO_LENGTH, &msg_val);
    napi_create_type_error(env, NULL, msg_val, &err);
    napi_create_string_utf8(env, code, NAPI_AUTO_LENGTH, &code_val);
    napi_set_named_property(env, err, "code", code_val);
    napi_throw(env, err);
}

/* Leaf name validation */
bool is_valid_leaf_name(const char *name) {
    if (!name || name[0] == '\0') return false;
    if (strcmp(name, ".") == 0 || strcmp(name, "..") == 0) return false;
    for (const char *p = name; *p != '\0'; p++) {
        if (*p == '/' || *p == '\0') return false;
    }
    return true;
}

/* Capability finalizer (leak protection only) */
static void finalize_capability(napi_env env, void *finalize_data, void *finalize_hint) {
    (void)env;
    (void)finalize_hint;
    AdvisorCap *cap = (AdvisorCap *)finalize_data;
    if (cap) {
        if (!cap->closed && cap->fd >= 0) {
            close(cap->fd);
            cap->closed = true;
        }
        if (cap->leaf_name) {
            free(cap->leaf_name);
            cap->leaf_name = NULL;
        }
        free(cap);
    }
}

/* Wrap AdvisorCap in a JavaScript object */
napi_value create_capability_js(napi_env env, AdvisorCap *cap) {
    napi_value obj;
    if (napi_create_object(env, &obj) != napi_ok) {
        throw_advisor_error(env, "STATE_IO_FAILED", "Failed to create capability object");
        return NULL;
    }

    napi_status wrap_status = napi_wrap(env, obj, cap, finalize_capability, NULL, NULL);
    if (wrap_status != napi_ok) {
        throw_advisor_error(env, "STATE_IO_FAILED", "Failed to wrap capability");
        return NULL;
    }

    napi_value kind_val, dev_val, ino_val, created_val;
    napi_create_string_utf8(env, cap->kind == CAP_DIR ? "directory" : "file", NAPI_AUTO_LENGTH, &kind_val);
    napi_create_bigint_int64(env, cap->dev, &dev_val);
    napi_create_bigint_uint64(env, cap->ino, &ino_val);
    napi_get_boolean(env, cap->created, &created_val);

    napi_set_named_property(env, obj, "type", kind_val);
    napi_set_named_property(env, obj, "dev", dev_val);
    napi_set_named_property(env, obj, "ino", ino_val);
    napi_set_named_property(env, obj, "created", created_val);

    return obj;
}

/* Unwrap AdvisorCap from a JavaScript value */
AdvisorCap *unwrap_capability(napi_env env, napi_value val, CapKind expected_kind) {
    if (!val) {
        throw_advisor_error(env, "STATE_IO_FAILED", "Null or undefined capability");
        return NULL;
    }

    void *ptr = NULL;
    napi_status status = napi_unwrap(env, val, &ptr);
    if (status != napi_ok || !ptr) {
        throw_advisor_error(env, "STATE_IO_FAILED", "Invalid capability handle");
        return NULL;
    }

    AdvisorCap *cap = (AdvisorCap *)ptr;
    if (cap->closed) {
        throw_advisor_error(env, "STATE_IO_FAILED", "Capability is closed");
        return NULL;
    }

    if (expected_kind != 0 && cap->kind != expected_kind) {
        throw_advisor_error(env, "STATE_IO_FAILED", "Capability kind mismatch");
        return NULL;
    }

    return cap;
}

/* Create stat JS object */
napi_value create_stat_js(napi_env env, const struct darwin_stat *st) {
    napi_value obj;
    napi_create_object(env, &obj);

    const char *type_str = "other";
    uint16_t fmt = st->st_mode & DARWIN_S_IFMT;
    if (fmt == DARWIN_S_IFDIR) type_str = "directory";
    else if (fmt == DARWIN_S_IFREG) type_str = "file";
    else if (fmt == DARWIN_S_IFLNK) type_str = "symlink";

    napi_value type_val, dev_val, ino_val, nlink_val, size_val, mtime_val;
    napi_create_string_utf8(env, type_str, NAPI_AUTO_LENGTH, &type_val);
    napi_create_bigint_int64(env, st->st_dev, &dev_val);
    napi_create_bigint_uint64(env, st->st_ino, &ino_val);
    napi_create_bigint_uint64(env, st->st_nlink, &nlink_val);
    napi_create_bigint_int64(env, st->st_size, &size_val);

    int64_t mtime_ns = (int64_t)st->st_mtimespec.tv_sec * 1000000000LL + (int64_t)st->st_mtimespec.tv_nsec;
    napi_create_bigint_int64(env, mtime_ns, &mtime_val);

    napi_set_named_property(env, obj, "type", type_val);
    napi_set_named_property(env, obj, "dev", dev_val);
    napi_set_named_property(env, obj, "ino", ino_val);
    napi_set_named_property(env, obj, "nlink", nlink_val);
    napi_set_named_property(env, obj, "size", size_val);
    napi_set_named_property(env, obj, "mtimeNs", mtime_val);

    return obj;
}

/* Helper to define export function */
static void set_function(napi_env env, napi_value exports, const char *name, napi_callback cb) {
    napi_value fn;
    napi_create_function(env, name, NAPI_AUTO_LENGTH, cb, NULL, &fn);
    napi_set_named_property(env, exports, name, fn);
}

/* Module initialization */
NAPI_MODULE_INIT() {
    /* Export abiVersion constant */
    napi_value abi_val;
    napi_create_int32(env, ADVISOR_NATIVE_ABI_VERSION, &abi_val);
    napi_set_named_property(env, exports, "abiVersion", abi_val);

    /* Storage exports */
    set_function(env, exports, "openRoot", export_openRoot);
    set_function(env, exports, "openDirectory", export_openDirectory);
    set_function(env, exports, "verifyChain", export_verifyChain);
    set_function(env, exports, "statEntry", export_statEntry);
    set_function(env, exports, "statHandle", export_statHandle);
    set_function(env, exports, "openRegular", export_openRegular);
    set_function(env, exports, "readInto", export_readInto);
    set_function(env, exports, "writeExclusive", export_writeExclusive);
    set_function(env, exports, "commit", export_commit);
    set_function(env, exports, "removeOwned", export_removeOwned);
    set_function(env, exports, "list", export_list);
    set_function(env, exports, "removeEmptyDirectory", export_removeEmptyDirectory);
    set_function(env, exports, "sync", export_sync);
    set_function(env, exports, "close", export_close);

    /* Process export */
    set_function(env, exports, "processSnapshot", export_processSnapshot);

    return exports;
}
