/*
 * process.c
 *
 * Monotonic Darwin process snapshot via SDK-declared proc_pid_rusage(RUSAGE_INFO_V0).
 * Emits exact decimal start token without floating-point conversion.
 *
 * Copyright (c) 2026 EigenCrate. Licensed under MIT.
 */

#include "advisor-native.h"

napi_value export_processSnapshot(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value argv[1];
    if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1) {
        throw_advisor_error(env, "PROCESS_FAILED", "processSnapshot requires pid argument");
        return NULL;
    }

    int32_t pid = 0;
    if (napi_get_value_int32(env, argv[0], &pid) != napi_ok || pid <= 0) {
        throw_advisor_error(env, "PROCESS_FAILED", "Invalid pid passed to processSnapshot");
        return NULL;
    }

    struct rusage_info_v0 rusage;
    memset(&rusage, 0, sizeof(rusage));
    darwin_errno = 0;

    int r = proc_pid_rusage(pid, RUSAGE_INFO_V0, (void *)&rusage);
    int err = darwin_errno;

    napi_value result;
    napi_create_object(env, &result);

    if (r == 0) {
        if (rusage.ri_proc_start_abstime > 0) {
            char start_str[32];
            snprintf(start_str, sizeof(start_str), "%llu", (unsigned long long)rusage.ri_proc_start_abstime);

            napi_value kind_val, start_val;
            napi_create_string_utf8(env, "present", NAPI_AUTO_LENGTH, &kind_val);
            napi_create_string_utf8(env, start_str, NAPI_AUTO_LENGTH, &start_val);

            napi_set_named_property(env, result, "kind", kind_val);
            napi_set_named_property(env, result, "start", start_val);
            return result;
        } else {
            /* Zero start time is invalid / unknown */
            napi_value kind_val;
            napi_create_string_utf8(env, "unknown", NAPI_AUTO_LENGTH, &kind_val);
            napi_set_named_property(env, result, "kind", kind_val);
            return result;
        }
    }

    if (err == DARWIN_ESRCH) {
        napi_value kind_val;
        napi_create_string_utf8(env, "missing", NAPI_AUTO_LENGTH, &kind_val);
        napi_set_named_property(env, result, "kind", kind_val);
        return result;
    }

    /* EPERM, EACCES, or other errno indicates unknown / permission boundary */
    napi_value kind_val;
    napi_create_string_utf8(env, "unknown", NAPI_AUTO_LENGTH, &kind_val);
    napi_set_named_property(env, result, "kind", kind_val);
    return result;
}
