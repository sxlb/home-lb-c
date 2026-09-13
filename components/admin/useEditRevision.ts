"use client";

import { useCallback, useRef } from "react";

/**
 * 编辑修订号：每次数据改动 +1，用于判断「一次异步保存期间用户是否又改了东西」。
 *
 * 背景：保存是一次 PUT 往返（几百毫秒到一两秒），这期间用户完全可能继续输入。
 * 若保存成功后无条件清掉「有未保存的更改」、并用服务端结果覆盖本地状态，会出现两个问题：
 *   1. 漏提示：界面显示已保存，其实最后几次输入根本没提交；
 *   2. 吞输入：本地状态被服务端结果覆盖，刚敲的内容当场消失。
 *
 * 用法：改动数据时调用 markEdited()（与 setDirty(true) 成对出现），保存前记录
 * revisionRef.current，保存成功后用 isStale(savedRevision) 判断：
 *   - false（期间没有新改动）：本次提交覆盖了全部改动 → 可清脏标记、可用服务端结果同步本地；
 *   - true（期间又有新改动）：保留脏标记与本地输入，提示用户再保存一次。
 */
export function useEditRevision() {
  const revisionRef = useRef(0);

  /** 数据被改动时调用 */
  const markEdited = useCallback(() => {
    revisionRef.current += 1;
  }, []);

  /** 这次保存之后是否又产生了新改动 */
  const isStale = useCallback((savedRevision: number) => revisionRef.current !== savedRevision, []);

  /** 供全局保存注册中心读取当前修订号 */
  const currentRevision = useCallback(() => revisionRef.current, []);

  return { revisionRef, markEdited, isStale, currentRevision };
}
