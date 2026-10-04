/*
 * advisor-native.h
 *
 * Darwin native advisor support bridge.
 * Node-API C addon providing descriptor-relative filesystem operations
 * and monotonic process identity via proc_pid_rusage(RUSAGE_INFO_V0).
 *
 * Bridge ABI: 1
 * Node-API: 8
 * Target: Darwin (macOS 11.0+)
 *
 * Copyright (c) 2026 EigenCrate. Licensed under MIT.
 */

#ifndef ADVISOR_NATIVE_H
#define ADVISOR_NATIVE_H

#define NAPI_VERSION 8
#define ADVISOR_NATIVE_ABI_VERSION 1

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>
#include <node_api.h>

/* Compile-time static assertions */
#ifndef _Static_assert
#define _Static_assert(cond, msg) typedef char static_assertion_##msg[(cond)?1:-1]
#endif

/* Darwin sys/resource.h declarations (RUSAGE_INFO_V0) */
#define RUSAGE_INFO_V0 0

struct rusage_info_v0 {
    uint8_t  ri_uuid[16];
    uint64_t ri_user_time;
    uint64_t ri_system_time;
    uint64_t ri_pkg_idle_wkups;
    uint64_t ri_interrupt_wkups;
    uint64_t ri_pageins;
    uint64_t ri_wired_size;
    uint64_t ri_resident_size;
    uint64_t ri_phys_footprint;
    uint64_t ri_proc_start_abstime;
    uint64_t ri_proc_exit_abstime;
};

_Static_assert(sizeof(struct rusage_info_v0) == 96, rusage_info_v0_size_96);
_Static_assert(offsetof(struct rusage_info_v0, ri_proc_start_abstime) == 80, ri_proc_start_abstime_offset_80);

/* Darwin 64-bit struct stat declarations */
struct darwin_timespec {
    int64_t tv_sec;
    int64_t tv_nsec;
};

struct darwin_stat {
    int32_t                st_dev;
    uint16_t               st_mode;
    uint16_t               st_nlink;
    uint64_t               st_ino;
    uint32_t               st_uid;
    uint32_t               st_gid;
    int32_t                st_rdev;
    struct darwin_timespec st_atimespec;
    struct darwin_timespec st_mtimespec;
    struct darwin_timespec st_ctimespec;
    struct darwin_timespec st_birthtimespec;
    int64_t                st_size;
    int64_t                st_blocks;
    int32_t                st_blksize;
    uint32_t               st_flags;
    uint32_t               st_gen;
    int32_t                st_lspare;
    int64_t                st_qspare[2];
};

_Static_assert(sizeof(struct darwin_stat) == 144, darwin_stat_size_144);
_Static_assert(offsetof(struct darwin_stat, st_ino) == 8, darwin_stat_st_ino_offset_8);
_Static_assert(offsetof(struct darwin_stat, st_size) == 96, darwin_stat_st_size_offset_96);

/* Darwin syscall flags & constants */
#define DARWIN_AT_FDCWD              (-2)
#define DARWIN_AT_SYMLINK_NOFOLLOW   0x0020
#define DARWIN_AT_REMOVEDIR          0x0080
#define DARWIN_RENAME_EXCL           0x00000004

#define DARWIN_O_RDONLY              0x0000
#define DARWIN_O_WRONLY              0x0001
#define DARWIN_O_RDWR                0x0002
#define DARWIN_O_NONBLOCK            0x0004
#define DARWIN_O_CREAT               0x0200
#define DARWIN_O_EXCL                0x0800
#define DARWIN_O_NOFOLLOW            0x0100
#define DARWIN_O_DIRECTORY           0x100000
#define DARWIN_O_CLOEXEC             0x1000000

#define DARWIN_S_IFMT                0170000
#define DARWIN_S_IFDIR               0040000
#define DARWIN_S_IFREG               0100000
#define DARWIN_S_IFLNK               0120000

/* Darwin errno constants */
#define DARWIN_EPERM                 1
#define DARWIN_ENOENT                2
#define DARWIN_ESRCH                 3
#define DARWIN_EACCES                13
#define DARWIN_EEXIST                17
#define DARWIN_EINVAL                22

/* Syscall / libc external prototypes */
extern int proc_pid_rusage(int pid, int flavor, void *buffer);
extern int open(const char *path, int flags, ...);
extern int openat(int fd, const char *path, int flags, ...);
extern int fstat(int fd, struct darwin_stat *buf);
extern int fstatat(int fd, const char *path, struct darwin_stat *buf, int flag);
extern int mkdirat(int fd, const char *path, uint16_t mode);
extern int unlinkat(int fd, const char *path, int flag);
extern int renameat(int fromfd, const char *from, int tofd, const char *to);
extern int renameatx_np(int fromfd, const char *from, int tofd, const char *to, unsigned int flags);
extern int readlinkat(int fd, const char *path, char *buf, size_t bufsize);
extern int fsync(int fd);
extern int close(int fd);
extern int dup(int fd);
extern int fcntl(int fd, int cmd, ...);
extern long pread(int fd, void *buf, size_t count, int64_t offset);
extern long pwrite(int fd, const void *buf, size_t count, int64_t offset);

/* Standard C runtime symbols linked from libSystem */
extern void *malloc(size_t size);
extern void free(void *ptr);
extern void *memset(void *s, int c, size_t n);
extern void *memcpy(void *dest, const void *src, size_t n);
extern size_t strlen(const char *s);
extern int strcmp(const char *s1, const char *s2);
extern int strncmp(const char *s1, const char *s2, size_t n);
extern char *strdup(const char *s);
extern int snprintf(char *str, size_t size, const char *format, ...);
extern int *__error(void);
#define darwin_errno (*__error())

/* Capability definition */
typedef enum {
    CAP_DIR = 1,
    CAP_FILE = 2
} CapKind;

typedef struct AdvisorCap {
    int fd;
    CapKind kind;
    int32_t dev;
    uint64_t ino;
    bool closed;
    bool created;
    struct AdvisorCap *parent;
    char *leaf_name;
} AdvisorCap;

/* Process snapshot result */
typedef enum {
    SNAPSHOT_PRESENT = 1,
    SNAPSHOT_MISSING = 2,
    SNAPSHOT_UNKNOWN = 3
} SnapshotKind;

typedef struct {
    SnapshotKind kind;
    char start[24];
} ProcessSnapshotResult;

/* Helper prototypes in advisor-native.c */
void throw_advisor_error(napi_env env, const char *code, const char *msg);
bool is_valid_leaf_name(const char *name);
napi_value create_capability_js(napi_env env, AdvisorCap *cap);
AdvisorCap *unwrap_capability(napi_env env, napi_value val, CapKind expected_kind);
napi_value create_stat_js(napi_env env, const struct darwin_stat *st);

/* Storage exports in storage.c */
napi_value export_openRoot(napi_env env, napi_callback_info info);
napi_value export_openDirectory(napi_env env, napi_callback_info info);
napi_value export_verifyChain(napi_env env, napi_callback_info info);
napi_value export_statEntry(napi_env env, napi_callback_info info);
napi_value export_statHandle(napi_env env, napi_callback_info info);
napi_value export_openRegular(napi_env env, napi_callback_info info);
napi_value export_readInto(napi_env env, napi_callback_info info);
napi_value export_writeExclusive(napi_env env, napi_callback_info info);
napi_value export_commit(napi_env env, napi_callback_info info);
napi_value export_removeOwned(napi_env env, napi_callback_info info);
napi_value export_list(napi_env env, napi_callback_info info);
napi_value export_removeEmptyDirectory(napi_env env, napi_callback_info info);
napi_value export_sync(napi_env env, napi_callback_info info);
napi_value export_close(napi_env env, napi_callback_info info);

/* Process export in process.c */
napi_value export_processSnapshot(napi_env env, napi_callback_info info);

#endif /* ADVISOR_NATIVE_H */
