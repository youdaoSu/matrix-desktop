import { createElement, useEffect, useRef, useState } from 'react';
import { getAuthToken, getUser } from '@/api';
import type { PlatformAccount } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { useOfficialWorkspace } from './OfficialWorkspace';

// A creator-center summary feed, not the WWW chat dialog. It never clicks an
// entry/contact, reuses a publisher document, or fills a composer. Pure DOM
// reads are tested separately; website-side unread behavior is not inferred.
// Kept laid out offscreen, not display:none (which collapses guest geometry).
export function DouyinMessageSource({ account, enabled, visible = true }: { account: PlatformAccount; enabled: boolean; visible?: boolean }) {
  const workspace = useOfficialWorkspace(), view = useRef<any>(null);
  const owner = getUser()?.id, token = getAuthToken();
  const [partition, setPartition] = useState(''), [error, setError] = useState('');
  const [ready, setReady] = useState(false), [show, setShow] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const current = () => active.current && getUser()?.id === owner && getAuthToken() === token;
  const input = () => {
    if (!current() || !ready || !view.current) throw Error('抖音消息读取页正在准备，稍后自动重试');
    return { accountId: account.id, platform: account.platform, sessionId: account.connectorSessionId!, accessToken: token || '', webContentsId: view.current.getWebContentsId() };
  };
  useEffect(() => {
    if (!enabled || partition) return;
    let alive = true;
    const desktop = window.matrixDesktop;
    if (!desktop?.isDesktop || !account.connectorSessionId) { setError('抖音自动消息读取需要桌面版和已绑定账号'); return; }
    void desktop.preparePlatformLogin('douyin', account.connectorSessionId).then(result => {
      if (!alive || !current()) return;
      if ('error' in result) throw Error(result.error);
      const expected = `persist:matrix-douyin-${account.connectorSessionId}`;
      if (result.sessionId !== account.connectorSessionId || result.partition !== expected || result.engine === 'webview2') throw Error('消息读取页会话与绑定账号不一致，未连接');
      setPartition(expected);
    }).catch(reason => { if (alive && current()) setError(reason instanceof Error ? reason.message : '消息读取页准备失败'); });
    return () => { alive = false; };
  }, [enabled, partition, owner, token, account.id, account.connectorSessionId]);
  useEffect(() => {
    if (!ready) return;
    return workspace.registerInteractionSource(account.id, account.connectorSessionId!, 'messages', input);
  }, [ready, owner, token, account.id, account.connectorSessionId, workspace.registerInteractionSource]);
  useEffect(() => {
    const guest = view.current;
    if (!partition || !guest) return;
    let alive = true;
    const loaded = () => { if (alive && current()) { guest.setAudioMuted(true); setReady(true); } };
    const failed = (event: { errorCode: number; isMainFrame?: boolean }) => {
      if (event.errorCode !== -3 && event.isMainFrame !== false && alive && current()) setError(`抖音消息页加载失败（${event.errorCode}），未当作没有消息`);
    };
    guest.addEventListener('dom-ready', loaded); guest.addEventListener('did-fail-load', failed);
    return () => { alive = false; guest.removeEventListener('dom-ready', loaded); guest.removeEventListener('did-fail-load', failed); };
  }, [partition, owner, token]);
  useEffect(() => {
    if (!ready || !enabled || !current()) return;
    setError('');
    // Registering/refreshing only reads the existing summary page. In
    // particular, do not open the WWW message popup, which can select a chat.
    window.dispatchEvent(new CustomEvent('matrix:interaction-refresh-request', { detail: { kind: 'messages' } }));
  }, [ready, enabled, owner, token, account.id, account.connectorSessionId]);
  if (!partition) return error ? <p role="alert">{account.nickname}：{error}</p> : null;
  return <div className="matrix-douyin-message-source" data-message-source-account={account.id}>
    {visible && <div className="matrix-interaction-toolbar"><small>{account.nickname} · {error || (ready ? '创作者消息摘要页已准备，读取结果见同步状态' : '正在准备消息读取页…')}</small><Button size="sm" variant="outline" onClick={() => setShow(true)}>查看{account.nickname}的官方消息页</Button></div>}
    <section className={`matrix-message-source-window ${show && visible ? 'is-visible' : ''}`} aria-label={`${account.nickname}抖音消息来源`} aria-hidden={!show || !visible}>
      <header><strong>{account.nickname} · 抖音官方消息页</strong><small>查看具体会话可能由平台标记已读；自动同步不会选择会话。</small><Button variant="outline" onClick={() => setShow(false)}>返回消息列表</Button></header>
      {createElement('webview', { ref: view, src: 'https://creator.douyin.com/creator-micro/data/following/chat', partition, style: { flex: 1, width: '100%', minHeight: 0 }, 'aria-label': '抖音官方消息读取页' })}
    </section>
  </div>;
}
