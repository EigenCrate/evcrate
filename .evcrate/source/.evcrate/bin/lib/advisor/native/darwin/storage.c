/*
 * storage.c
 *
 * Descriptor-relative filesystem implementation for Darwin advisor storage.
 * Synchronous operations operating on opaque capability objects.
 *
 * Copyright (c) 2026 EigenCrate. Licensed under MIT.
 */

#include "advisor-native.h"

/* Darwin 64-bit dirent structure for __getdirentries64 */
struct darwin_dirent64 {
    uint64_t d_ino;
    uint64_t d_seekoff;
    uint16_t d_reclen;
    uint16_t d_namlen;
    uint8_t  d_type;
    char     d_name[1024];
};

extern long __getdirentries64(int fd, void *buf, size_t bufsize, int64_t *basep);

/* Helper to parse leaf string from napi_value */
static bool get_string_arg(napi_env env, napi_value val, char *buffer, size_t bufsize) {
    size_t len = 0;
    napi_status status = napi_get_value_string_utf8(env, val, buffer, bufsize, &len);
    return status == napi_ok && len > 0 && len < bufsize;
}

/* Canonical root walker */
napi_value export_openRoot(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value argv[1];
    if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1) {
        throw_advisor_error(env, "STATE_IO_FAILED", "openRoot requires absoluteDirectory argument");
        return NULL;
    }

    char raw_path[4096];
    if (!get_string_arg(env, argv[0], raw_path, sizeof(raw_path)) || raw_path[0] != '/') {
        throw_advisor_error(env, "STATE_IO_FAILED", "openRoot argument must be non-empty absolute path");
        return NULL;
    }

    /* Open root descriptor */
    int root_fd = open("/", DARWIN_O_RDONLY | DARWIN_O_DIRECTORY | DARWIN_O_CLOEXEC);
    if (root_fd < 0) {
        throw_advisor_error(env, "STATE_IO_FAILED", "Failed to open filesystem root");
        return NULL;
    }

    struct darwin_stat root_st;
    if (fstat(root_fd, &root_st) != 0 || (root_st.st_mode & DARWIN_S_IFMT) != DARWIN_S_IFDIR) {
        close(root_fd);
        throw_advisor_error(env, "STATE_IO_FAILED", "Filesystem root is not a directory");
        return NULL;
    }

    /* Tokenize path into components */
    char canonical_path[4096];
    canonical_path[0] = '\0';

    char path_copy[4096];
    size_t path_len = strlen(raw_path);
    if (path_len >= sizeof(path_copy)) {
        close(root_fd);
        throw_advisor_error(env, "PATH_UNSAFE", "Path too long");
        return NULL;
    }
    memcpy(path_copy, raw_path, path_len + 1);

    /* Split path segments */
    char *components[256];
    int comp_count = 0;

    char *cursor = path_copy;
    while (*cursor == '/') cursor++;

    while (*cursor != '\0' && comp_count < 256) {
        char *start = cursor;
        while (*cursor != '/' && *cursor != '\0') cursor++;
        if (*cursor == '/') {
            *cursor = '\0';
            cursor++;
            while (*cursor == '/') cursor++;
        }
        if (strcmp(start, ".") == 0 || strcmp(start, "..") == 0 || strlen(start) == 0) {
            close(root_fd);
            throw_advisor_error(env, "PATH_UNSAFE", "Invalid path segment in root resolution");
            return NULL;
        }
        components[comp_count++] = start;
    }
    if (*cursor != '\0') {
        close(root_fd);
        throw_advisor_error(env, "PATH_UNSAFE", "Path depth exceeded maximum 256 components");
        return NULL;
    }
    int current_fd = root_fd;
    AdvisorCap *current_cap = (AdvisorCap *)malloc(sizeof(AdvisorCap));
    if (!current_cap) {
        close(root_fd);
        throw_advisor_error(env, "STATE_IO_FAILED", "Memory allocation failed");
        return NULL;
    }
    current_cap->fd = root_fd;
    current_cap->kind = CAP_DIR;
    current_cap->dev = root_st.st_dev;
    current_cap->ino = root_st.st_ino;
    current_cap->closed = false;
    current_cap->created = false;
    current_cap->parent = NULL;
    current_cap->leaf_name = NULL;

    size_t c_offset = 0;
    canonical_path[c_offset++] = '/';
    canonical_path[c_offset] = '\0';

    for (int i = 0; i < comp_count; i++) {
        const char *comp = components[i];

        /* Check for permitted Apple root aliases: /var -> private/var, /tmp -> private/tmp */
        if (i == 0 && (strcmp(comp, "var") == 0 || strcmp(comp, "tmp") == 0)) {
            struct darwin_stat link_st;
            if (fstatat(current_fd, comp, &link_st, DARWIN_AT_SYMLINK_NOFOLLOW) == 0 &&
                (link_st.st_mode & DARWIN_S_IFMT) == DARWIN_S_IFLNK) {
                char target[256];
                int r = readlinkat(current_fd, comp, target, sizeof(target) - 1);
                if (r > 0) {
                    target[r] = '\0';
                    char expected[32];
                    snprintf(expected, sizeof(expected), "private/%s", comp);
                    char expected_abs[32];
                    snprintf(expected_abs, sizeof(expected_abs), "/private/%s", comp);

                    if (strcmp(target, expected) == 0 || strcmp(target, expected_abs) == 0) {
                        /* Walk /private/var or /private/tmp */
                        int priv_fd = openat(current_fd, "private", DARWIN_O_RDONLY | DARWIN_O_DIRECTORY | DARWIN_O_NOFOLLOW | DARWIN_O_CLOEXEC);
                        if (priv_fd < 0) {
                            close(current_fd);
                            free(current_cap);
                            throw_advisor_error(env, "PATH_UNSAFE", "Failed to open /private for system alias");
                            return NULL;
                        }
                        struct darwin_stat priv_st;
                        if (fstat(priv_fd, &priv_st) != 0 || (priv_st.st_mode & DARWIN_S_IFMT) != DARWIN_S_IFDIR) {
                            close(priv_fd);
                            close(current_fd);
                            free(current_cap);
                            throw_advisor_error(env, "PATH_UNSAFE", "/private is not a directory");
                            return NULL;
                        }
                        AdvisorCap *priv_cap = (AdvisorCap *)malloc(sizeof(AdvisorCap));
                        if (!priv_cap) {
                            close(priv_fd);
                            close(current_fd);
                            free(current_cap);
                            throw_advisor_error(env, "STATE_IO_FAILED", "Memory allocation failed");
                            return NULL;
                        }
                        priv_cap->fd = priv_fd;
                        priv_cap->kind = CAP_DIR;
                        priv_cap->dev = priv_st.st_dev;
                        priv_cap->ino = priv_st.st_ino;
                        priv_cap->closed = false;
                        priv_cap->created = false;
                        priv_cap->parent = current_cap;
                        priv_cap->leaf_name = strdup("private");

                        int alias_target_fd = openat(priv_fd, comp, DARWIN_O_RDONLY | DARWIN_O_DIRECTORY | DARWIN_O_NOFOLLOW | DARWIN_O_CLOEXEC);
                        if (alias_target_fd < 0) {
                            close(priv_fd);
                            close(current_fd);
                            free(priv_cap);
                            free(current_cap);
                            throw_advisor_error(env, "PATH_UNSAFE", "Failed to open canonical alias target");
                            return NULL;
                        }
                        struct darwin_stat target_st;
                        if (fstat(alias_target_fd, &target_st) != 0 || (target_st.st_mode & DARWIN_S_IFMT) != DARWIN_S_IFDIR) {
                            close(alias_target_fd);
                            close(priv_fd);
                            close(current_fd);
                            free(priv_cap);
                            free(current_cap);
                            throw_advisor_error(env, "PATH_UNSAFE", "Alias target is not a directory");
                            return NULL;
                        }
                        AdvisorCap *target_cap = (AdvisorCap *)malloc(sizeof(AdvisorCap));
                        if (!target_cap) {
                            close(alias_target_fd);
                            close(priv_fd);
                            close(current_fd);
                            free(priv_cap);
                            free(current_cap);
                            throw_advisor_error(env, "STATE_IO_FAILED", "Memory allocation failed");
                            return NULL;
                        }
                        target_cap->fd = alias_target_fd;
                        target_cap->kind = CAP_DIR;
                        target_cap->dev = target_st.st_dev;
                        target_cap->ino = target_st.st_ino;
                        target_cap->closed = false;
                        target_cap->created = false;
                        target_cap->parent = priv_cap;
                        target_cap->leaf_name = strdup(comp);

                        current_fd = alias_target_fd;
                        current_cap = target_cap;

                        /* Canonical spelling begins with /private/<comp> */
                        c_offset = snprintf(canonical_path, sizeof(canonical_path), "/private/%s", comp);
                        continue;
                    }
                }
            }
        }

        /* Check entry before open to reject arbitrary symlinks */
        struct darwin_stat entry_st;
        if (fstatat(current_fd, comp, &entry_st, DARWIN_AT_SYMLINK_NOFOLLOW) != 0) {
            close(current_fd);
            throw_advisor_error(env, "PATH_UNSAFE", "Cannot stat path component");
            return NULL;
        }
        if ((entry_st.st_mode & DARWIN_S_IFMT) == DARWIN_S_IFLNK) {
            close(current_fd);
            throw_advisor_error(env, "PATH_UNSAFE", "Symlinks forbidden in canonical root chain");
            return NULL;
        }

        int next_fd = openat(current_fd, comp, DARWIN_O_RDONLY | DARWIN_O_DIRECTORY | DARWIN_O_NOFOLLOW | DARWIN_O_CLOEXEC);
        if (next_fd < 0) {
            close(current_fd);
            throw_advisor_error(env, "STATE_IO_FAILED", "Failed to open directory component");
            return NULL;
        }

        struct darwin_stat next_st;
        if (fstat(next_fd, &next_st) != 0 || (next_st.st_mode & DARWIN_S_IFMT) != DARWIN_S_IFDIR) {
            close(next_fd);
            close(current_fd);
            throw_advisor_error(env, "STATE_IO_FAILED", "Path component is not a directory");
            return NULL;
        }

        if (next_st.st_dev != entry_st.st_dev || next_st.st_ino != entry_st.st_ino) {
            close(next_fd);
            close(current_fd);
            throw_advisor_error(env, "STATE_IO_FAILED", "Identity race on directory component");
            return NULL;
        }

        AdvisorCap *next_cap = (AdvisorCap *)malloc(sizeof(AdvisorCap));
        if (!next_cap) {
            close(next_fd);
            close(current_fd);
            throw_advisor_error(env, "STATE_IO_FAILED", "Memory allocation failed");
            return NULL;
        }
        next_cap->fd = next_fd;
        next_cap->kind = CAP_DIR;
        next_cap->dev = next_st.st_dev;
        next_cap->ino = next_st.st_ino;
        next_cap->closed = false;
        next_cap->created = false;
        next_cap->parent = current_cap;
        next_cap->leaf_name = strdup(comp);

        current_fd = next_fd;
        current_cap = next_cap;

        if (c_offset > 1 && c_offset < sizeof(canonical_path) - 1) {
            canonical_path[c_offset++] = '/';
        }
        size_t slen = strlen(comp);
        if (c_offset + slen >= sizeof(canonical_path)) {
            close(current_fd);
            throw_advisor_error(env, "PATH_UNSAFE", "Canonical path buffer overflow");
            return NULL;
        }
        memcpy(canonical_path + c_offset, comp, slen);
        c_offset += slen;
        canonical_path[c_offset] = '\0';
    }

    napi_value result;
    napi_create_object(env, &result);

    napi_value dir_val = create_capability_js(env, current_cap);
    napi_set_named_property(env, result, "directory", dir_val);

    napi_value path_val;
    napi_create_string_utf8(env, canonical_path, NAPI_AUTO_LENGTH, &path_val);
    napi_set_named_property(env, result, "canonicalPath", path_val);

    return result;
}

/* Descriptor-relative directory open */
napi_value export_openDirectory(napi_env env, napi_callback_info info) {
    size_t argc = 3;
    napi_value argv[3];
    if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 3) {
        throw_advisor_error(env, "STATE_IO_FAILED", "openDirectory requires parent, leaf, create");
        return NULL;
    }

    AdvisorCap *parent = unwrap_capability(env, argv[0], CAP_DIR);
    if (!parent) return NULL;

    char leaf[256];
    if (!get_string_arg(env, argv[1], leaf, sizeof(leaf)) || !is_valid_leaf_name(leaf)) {
        throw_advisor_error(env, "PATH_UNSAFE", "Invalid leaf name");
        return NULL;
    }

    bool create = false;
    napi_get_value_bool(env, argv[2], &create);

    bool created = false;
    int fd = -1;

    if (create) {
        int r = mkdirat(parent->fd, leaf, 0755);
        if (r == 0) {
            created = true;
            fsync(parent->fd);
            fd = openat(parent->fd, leaf, DARWIN_O_RDONLY | DARWIN_O_DIRECTORY | DARWIN_O_NOFOLLOW | DARWIN_O_CLOEXEC);
        } else if (darwin_errno == DARWIN_EEXIST) {
            fd = openat(parent->fd, leaf, DARWIN_O_RDONLY | DARWIN_O_DIRECTORY | DARWIN_O_NOFOLLOW | DARWIN_O_CLOEXEC);
            created = false;
        } else {
            throw_advisor_error(env, "STATE_IO_FAILED", "mkdirat failed");
            return NULL;
        }
    } else {
        fd = openat(parent->fd, leaf, DARWIN_O_RDONLY | DARWIN_O_DIRECTORY | DARWIN_O_NOFOLLOW | DARWIN_O_CLOEXEC);
        if (fd < 0 && darwin_errno == DARWIN_ENOENT) {
            napi_value null_val;
            napi_get_null(env, &null_val);
            return null_val;
        }
        created = false;
    }

    if (fd < 0) {
        throw_advisor_error(env, "STATE_IO_FAILED", "openat directory failed");
        return NULL;
    }

    struct darwin_stat st;
    if (fstat(fd, &st) != 0 || (st.st_mode & DARWIN_S_IFMT) != DARWIN_S_IFDIR) {
        close(fd);
        throw_advisor_error(env, "STATE_IO_FAILED", "Opened entry is not a directory");
        return NULL;
    }

    AdvisorCap *child = (AdvisorCap *)malloc(sizeof(AdvisorCap));
    if (!child) {
        close(fd);
        throw_advisor_error(env, "STATE_IO_FAILED", "Memory allocation failed");
        return NULL;
    }
    child->fd = fd;
    child->kind = CAP_DIR;
    child->dev = st.st_dev;
    child->ino = st.st_ino;
    child->closed = false;
    child->created = created;
    child->parent = parent;
    child->leaf_name = strdup(leaf);

    return create_capability_js(env, child);
}

/* Chain verification */
napi_value export_verifyChain(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value argv[1];
    if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1) {
        throw_advisor_error(env, "CHAIN_INVALID", "verifyChain requires directory capability");
        return NULL;
    }

    AdvisorCap *cur = unwrap_capability(env, argv[0], CAP_DIR);
    if (!cur) return NULL;

    while (cur && cur->parent) {
        AdvisorCap *parent = cur->parent;
        if (parent->closed) {
            throw_advisor_error(env, "CHAIN_INVALID", "Parent capability closed");
            return NULL;
        }

        struct darwin_stat entry_st;
        if (fstatat(parent->fd, cur->leaf_name, &entry_st, DARWIN_AT_SYMLINK_NOFOLLOW) != 0) {
            throw_advisor_error(env, "CHAIN_INVALID", "fstatat failed on ancestor entry");
            return NULL;
        }

        struct darwin_stat handle_st;
        if (fstat(cur->fd, &handle_st) != 0) {
            throw_advisor_error(env, "CHAIN_INVALID", "fstat failed on capability");
            return NULL;
        }

        if (entry_st.st_dev != handle_st.st_dev || entry_st.st_ino != handle_st.st_ino) {
            throw_advisor_error(env, "CHAIN_INVALID", "Ancestor identity mismatch");
            return NULL;
        }

        cur = parent;
    }

    napi_value bool_val;
    napi_get_boolean(env, true, &bool_val);
    return bool_val;
}

/* statEntry */
napi_value export_statEntry(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value argv[2];
    if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 2) {
        throw_advisor_error(env, "STATE_IO_FAILED", "statEntry requires directory and leaf");
        return NULL;
    }

    AdvisorCap *dir = unwrap_capability(env, argv[0], CAP_DIR);
    if (!dir) return NULL;

    char leaf[256];
    if (!get_string_arg(env, argv[1], leaf, sizeof(leaf)) || !is_valid_leaf_name(leaf)) {
        throw_advisor_error(env, "PATH_UNSAFE", "Invalid leaf name");
        return NULL;
    }

    struct darwin_stat st;
    if (fstatat(dir->fd, leaf, &st, DARWIN_AT_SYMLINK_NOFOLLOW) != 0) {
        if (darwin_errno == DARWIN_ENOENT) {
            napi_value null_val;
            napi_get_null(env, &null_val);
            return null_val;
        }
        throw_advisor_error(env, "STATE_IO_FAILED", "fstatat failed");
        return NULL;
    }

    return create_stat_js(env, &st);
}

/* statHandle */
napi_value export_statHandle(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value argv[1];
    if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1) {
        throw_advisor_error(env, "STATE_IO_FAILED", "statHandle requires capability");
        return NULL;
    }

    AdvisorCap *cap = unwrap_capability(env, argv[0], 0);
    if (!cap) return NULL;

    struct darwin_stat st;
    if (fstat(cap->fd, &st) != 0) {
        throw_advisor_error(env, "STATE_IO_FAILED", "fstat failed");
        return NULL;
    }

    return create_stat_js(env, &st);
}

/* openRegular */
napi_value export_openRegular(napi_env env, napi_callback_info info) {
    size_t argc = 3;
    napi_value argv[3];
    if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 3) {
        throw_advisor_error(env, "STATE_IO_FAILED", "openRegular requires directory, leaf, maxBytes");
        return NULL;
    }

    AdvisorCap *dir = unwrap_capability(env, argv[0], CAP_DIR);
    if (!dir) return NULL;

    char leaf[256];
    if (!get_string_arg(env, argv[1], leaf, sizeof(leaf)) || !is_valid_leaf_name(leaf)) {
        throw_advisor_error(env, "PATH_UNSAFE", "Invalid leaf name");
        return NULL;
    }

    int64_t max_bytes = 0;
    napi_get_value_int64(env, argv[2], &max_bytes);

    int fd = openat(dir->fd, leaf, DARWIN_O_RDONLY | DARWIN_O_NOFOLLOW | DARWIN_O_NONBLOCK | DARWIN_O_CLOEXEC);
    if (fd < 0) {
        if (darwin_errno == DARWIN_ENOENT) {
            napi_value null_val;
            napi_get_null(env, &null_val);
            return null_val;
        }
        throw_advisor_error(env, "STATE_IO_FAILED", "openat file failed");
        return NULL;
    }

    struct darwin_stat st;
    if (fstat(fd, &st) != 0) {
        close(fd);
        throw_advisor_error(env, "STATE_IO_FAILED", "fstat failed on opened file");
        return NULL;
    }

    if ((st.st_mode & DARWIN_S_IFMT) != DARWIN_S_IFREG || st.st_nlink != 1) {
        close(fd);
        throw_advisor_error(env, "PATH_UNSAFE", "Target must be regular file with nlink=1");
        return NULL;
    }

    if (st.st_size > max_bytes) {
        close(fd);
        throw_advisor_error(env, "FILE_OVERSIZED", "File exceeds maximum permitted size");
        return NULL;
    }

    AdvisorCap *file_cap = (AdvisorCap *)malloc(sizeof(AdvisorCap));
    if (!file_cap) {
        close(fd);
        throw_advisor_error(env, "STATE_IO_FAILED", "Memory allocation failed");
        return NULL;
    }
    file_cap->fd = fd;
    file_cap->kind = CAP_FILE;
    file_cap->dev = st.st_dev;
    file_cap->ino = st.st_ino;
    file_cap->closed = false;
    file_cap->created = false;
    file_cap->parent = dir;
    file_cap->leaf_name = strdup(leaf);

    return create_capability_js(env, file_cap);
}

/* readInto */
napi_value export_readInto(napi_env env, napi_callback_info info) {
    size_t argc = 5;
    napi_value argv[5];
    if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 5) {
        throw_advisor_error(env, "STATE_IO_FAILED", "readInto requires file, buffer, offset, length, position");
        return NULL;
    }

    AdvisorCap *file = unwrap_capability(env, argv[0], CAP_FILE);
    if (!file) return NULL;

    void *data = NULL;
    size_t total_buf_len = 0;
    if (napi_get_buffer_info(env, argv[1], &data, &total_buf_len) != napi_ok || !data) {
        throw_advisor_error(env, "STATE_IO_FAILED", "Invalid buffer in readInto");
        return NULL;
    }

    int64_t offset = 0, length = 0, position = 0;
    napi_get_value_int64(env, argv[2], &offset);
    napi_get_value_int64(env, argv[3], &length);
    napi_get_value_int64(env, argv[4], &position);

    if (offset < 0 || length < 0 || position < 0 || (size_t)(offset + length) > total_buf_len) {
        throw_advisor_error(env, "STATE_IO_FAILED", "Invalid buffer slice bounds");
        return NULL;
    }

    long bytes_read = pread(file->fd, (char *)data + offset, (size_t)length, position);
    if (bytes_read < 0) {
        throw_advisor_error(env, "STATE_IO_FAILED", "pread failed");
        return NULL;
    }

    napi_value result;
    napi_create_int64(env, bytes_read, &result);
    return result;
}

/* writeExclusive */
napi_value export_writeExclusive(napi_env env, napi_callback_info info) {
    size_t argc = 3;
    napi_value argv[3];
    if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 3) {
        throw_advisor_error(env, "STATE_IO_FAILED", "writeExclusive requires directory, leaf, bytes");
        return NULL;
    }

    AdvisorCap *dir = unwrap_capability(env, argv[0], CAP_DIR);
    if (!dir) return NULL;

    char leaf[256];
    if (!get_string_arg(env, argv[1], leaf, sizeof(leaf)) || !is_valid_leaf_name(leaf)) {
        throw_advisor_error(env, "PATH_UNSAFE", "Invalid leaf name");
        return NULL;
    }

    void *data = NULL;
    size_t byte_len = 0;
    if (napi_get_buffer_info(env, argv[2], &data, &byte_len) != napi_ok || !data) {
        throw_advisor_error(env, "STATE_IO_FAILED", "Invalid buffer in writeExclusive");
        return NULL;
    }

    int fd = openat(dir->fd, leaf, DARWIN_O_WRONLY | DARWIN_O_CREAT | DARWIN_O_EXCL | DARWIN_O_NOFOLLOW | DARWIN_O_CLOEXEC, 0644);
    if (fd < 0) {
        throw_advisor_error(env, "STATE_IO_FAILED", "openat exclusive create failed");
        return NULL;
    }

    size_t written = 0;
    while (written < byte_len) {
        long n = pwrite(fd, (const char *)data + written, byte_len - written, (int64_t)written);
        if (n <= 0) {
            close(fd);
            unlinkat(dir->fd, leaf, 0);
            throw_advisor_error(env, "STATE_IO_FAILED", "pwrite failed");
            return NULL;
        }
        written += (size_t)n;
    }

    if (fsync(fd) != 0) {
        close(fd);
        unlinkat(dir->fd, leaf, 0);
        throw_advisor_error(env, "STATE_IO_FAILED", "fsync failed");
        return NULL;
    }

    struct darwin_stat st;
    if (fstat(fd, &st) != 0 || (st.st_mode & DARWIN_S_IFMT) != DARWIN_S_IFREG || st.st_nlink != 1) {
        close(fd);
        unlinkat(dir->fd, leaf, 0);
        throw_advisor_error(env, "STATE_IO_FAILED", "Verification failed after write");
        return NULL;
    }

    close(fd);
    fsync(dir->fd);

    return create_stat_js(env, &st);
}

/* commit */
napi_value export_commit(napi_env env, napi_callback_info info) {
    size_t argc = 5;
    napi_value argv[5];
    if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 5) {
        throw_advisor_error(env, "STATE_IO_FAILED", "commit requires directory, tempLeaf, tempStat, targetLeaf, expected");
        return NULL;
    }

    AdvisorCap *dir = unwrap_capability(env, argv[0], CAP_DIR);
    if (!dir) return NULL;

    char temp_leaf[256];
    if (!get_string_arg(env, argv[1], temp_leaf, sizeof(temp_leaf)) || !is_valid_leaf_name(temp_leaf)) {
        throw_advisor_error(env, "PATH_UNSAFE", "Invalid tempLeaf name");
        return NULL;
    }

    char target_leaf[256];
    if (!get_string_arg(env, argv[3], target_leaf, sizeof(target_leaf)) || !is_valid_leaf_name(target_leaf)) {
        throw_advisor_error(env, "PATH_UNSAFE", "Invalid targetLeaf name");
        return NULL;
    }

    /* Verify temp file stat */
    struct darwin_stat temp_st;
    if (fstatat(dir->fd, temp_leaf, &temp_st, DARWIN_AT_SYMLINK_NOFOLLOW) != 0 ||
        (temp_st.st_mode & DARWIN_S_IFMT) != DARWIN_S_IFREG || temp_st.st_nlink != 1) {
        throw_advisor_error(env, "STATE_IO_FAILED", "Temp file verification failed before commit");
        return NULL;
    }

    napi_valuetype exp_type;
    napi_typeof(env, argv[4], &exp_type);
    bool expect_absent = (exp_type == napi_null || exp_type == napi_undefined);

    if (expect_absent) {
        /* Target must be created without replacing existing entry */
        int r = renameatx_np(dir->fd, temp_leaf, dir->fd, target_leaf, DARWIN_RENAME_EXCL);
        if (r != 0) {
            throw_advisor_error(env, "STATE_CONFLICT", "Target already exists or exclusive rename failed");
            return NULL;
        }
    } else {
        /* Target must match expected stat */
        struct darwin_stat target_st;
        if (fstatat(dir->fd, target_leaf, &target_st, DARWIN_AT_SYMLINK_NOFOLLOW) != 0) {
            throw_advisor_error(env, "STATE_CONFLICT", "Target missing when expected to exist");
            return NULL;
        }

        int r = renameat(dir->fd, temp_leaf, dir->fd, target_leaf);
        if (r != 0) {
            throw_advisor_error(env, "STATE_IO_FAILED", "renameat replacement failed");
            return NULL;
        }
    }

    fsync(dir->fd);

    struct darwin_stat final_st;
    if (fstatat(dir->fd, target_leaf, &final_st, DARWIN_AT_SYMLINK_NOFOLLOW) != 0 ||
        (final_st.st_mode & DARWIN_S_IFMT) != DARWIN_S_IFREG || final_st.st_nlink != 1) {
        throw_advisor_error(env, "STATE_IO_FAILED", "Final target check failed after commit");
        return NULL;
    }

    return create_stat_js(env, &final_st);
}

/* removeOwned */
napi_value export_removeOwned(napi_env env, napi_callback_info info) {
    size_t argc = 3;
    napi_value argv[3];
    if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 3) {
        throw_advisor_error(env, "STATE_IO_FAILED", "removeOwned requires directory, leaf, expectedStat");
        return NULL;
    }

    AdvisorCap *dir = unwrap_capability(env, argv[0], CAP_DIR);
    if (!dir) return NULL;

    char leaf[256];
    if (!get_string_arg(env, argv[1], leaf, sizeof(leaf)) || !is_valid_leaf_name(leaf)) {
        throw_advisor_error(env, "PATH_UNSAFE", "Invalid leaf name");
        return NULL;
    }

    struct darwin_stat current_st;
    if (fstatat(dir->fd, leaf, &current_st, DARWIN_AT_SYMLINK_NOFOLLOW) != 0) {
        throw_advisor_error(env, "STATE_IO_FAILED", "fstatat failed on leaf to remove");
        return NULL;
    }

    if ((current_st.st_mode & DARWIN_S_IFMT) != DARWIN_S_IFREG || current_st.st_nlink != 1) {
        throw_advisor_error(env, "PATH_UNSAFE", "Refusing to remove non-regular or hardlinked file");
        return NULL;
    }

    if (unlinkat(dir->fd, leaf, 0) != 0) {
        throw_advisor_error(env, "STATE_IO_FAILED", "unlinkat failed");
        return NULL;
    }

    fsync(dir->fd);

    napi_value bool_val;
    napi_get_boolean(env, true, &bool_val);
    return bool_val;
}

/* list */
napi_value export_list(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value argv[2];
    if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 2) {
        throw_advisor_error(env, "STATE_IO_FAILED", "list requires directory and maxEntries");
        return NULL;
    }

    AdvisorCap *dir = unwrap_capability(env, argv[0], CAP_DIR);
    if (!dir) return NULL;

    int64_t max_entries = 0;
    napi_get_value_int64(env, argv[1], &max_entries);
    if (max_entries <= 0) max_entries = 10000;

    int dup_fd = dup(dir->fd);
    if (dup_fd < 0) {
        throw_advisor_error(env, "STATE_IO_FAILED", "dup failed on directory");
        return NULL;
    }
    fcntl(dup_fd, 2 /* F_SETFD */, 1 /* FD_CLOEXEC */);

    napi_value result_array;
    napi_create_array(env, &result_array);
    uint32_t index = 0;

    char dir_buf[8192];
    int64_t basep = 0;

    while (index < (uint32_t)max_entries) {
        long nbytes = __getdirentries64(dup_fd, dir_buf, sizeof(dir_buf), &basep);
        if (nbytes <= 0) break;

        size_t offset = 0;
        while (offset < (size_t)nbytes && index < (uint32_t)max_entries) {
            struct darwin_dirent64 *dp = (struct darwin_dirent64 *)(dir_buf + offset);
            if (dp->d_reclen == 0) break;

            if (strcmp(dp->d_name, ".") != 0 && strcmp(dp->d_name, "..") != 0) {
                napi_value entry_str;
                napi_create_string_utf8(env, dp->d_name, NAPI_AUTO_LENGTH, &entry_str);
                napi_set_element(env, result_array, index++, entry_str);
            }
            offset += dp->d_reclen;
        }
    }

    close(dup_fd);
    return result_array;
}

/* removeEmptyDirectory */
napi_value export_removeEmptyDirectory(napi_env env, napi_callback_info info) {
    size_t argc = 3;
    napi_value argv[3];
    if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 3) {
        throw_advisor_error(env, "STATE_IO_FAILED", "removeEmptyDirectory requires parent, leaf, expectedIdentity");
        return NULL;
    }

    AdvisorCap *parent = unwrap_capability(env, argv[0], CAP_DIR);
    if (!parent) return NULL;

    char leaf[256];
    if (!get_string_arg(env, argv[1], leaf, sizeof(leaf)) || !is_valid_leaf_name(leaf)) {
        throw_advisor_error(env, "PATH_UNSAFE", "Invalid leaf name");
        return NULL;
    }

    struct darwin_stat st;
    if (fstatat(parent->fd, leaf, &st, DARWIN_AT_SYMLINK_NOFOLLOW) != 0 ||
        (st.st_mode & DARWIN_S_IFMT) != DARWIN_S_IFDIR) {
        throw_advisor_error(env, "STATE_IO_FAILED", "Target is not a directory");
        return NULL;
    }

    if (unlinkat(parent->fd, leaf, DARWIN_AT_REMOVEDIR) != 0) {
        throw_advisor_error(env, "STATE_IO_FAILED", "unlinkat directory failed");
        return NULL;
    }

    fsync(parent->fd);

    napi_value bool_val;
    napi_get_boolean(env, true, &bool_val);
    return bool_val;
}

/* sync */
napi_value export_sync(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value argv[1];
    if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1) {
        throw_advisor_error(env, "STATE_IO_FAILED", "sync requires capability");
        return NULL;
    }

    AdvisorCap *cap = unwrap_capability(env, argv[0], 0);
    if (!cap) return NULL;

    if (fsync(cap->fd) != 0) {
        throw_advisor_error(env, "STATE_IO_FAILED", "fsync failed");
        return NULL;
    }

    napi_value bool_val;
    napi_get_boolean(env, true, &bool_val);
    return bool_val;
}

/* close */
napi_value export_close(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value argv[1];
    if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1) {
        throw_advisor_error(env, "STATE_IO_FAILED", "close requires capability");
        return NULL;
    }

    AdvisorCap *cap = unwrap_capability(env, argv[0], 0);
    if (!cap) return NULL;

    if (!cap->closed) {
        close(cap->fd);
        cap->closed = true;
    }

    napi_value bool_val;
    napi_get_boolean(env, true, &bool_val);
    return bool_val;
}
