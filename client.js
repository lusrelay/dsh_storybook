window.__ModuleLoader__.load({
  id: '@local/dsh-storybook',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback } = React;

    const API = '/storybook/api';
    const MODULES = [
      { key: 'basic', label: '基础设定', glyph: '◈', hint: '类型 · 基调 · 卖点 · 底线' },
      { key: 'world', label: '世界观', glyph: '❖', hint: '地理 · 势力 · 规则 · 历史' },
      { key: 'character', label: '角色', glyph: '☾', hint: '身份 · 性格 · 动机 · 关系' },
      { key: 'timeline', label: '时间线', glyph: '⟳', hint: '事件 · 伏笔 · 记忆库', memory: true },
      { key: 'craft', label: '制作', glyph: '✦', hint: '资料格式化 · 文风 · 大纲' },
      { key: 'chat', label: '对话', glyph: '✧', hint: '故事模式 · 游戏模式' },
    ];
    const MODULE_LABEL = { basic: '基础设定', world: '世界观', character: '角色', timeline: '时间线', craft: '制作' };

    async function request(action, payload) {
      let response;
      try {
        response = await fetch(`${API}?action=${encodeURIComponent(action)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, ...(payload || {}) }),
          credentials: 'same-origin',
        });
      } catch (error) {
        throw new Error(`无法连接故事工坊服务：${error?.message || error}`);
      }
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error('故事工坊接口没有返回 JSON，请确认插件已加载并重启 Harness');
      }
      if (!response.ok || data?.error) throw new Error(data?.error || `请求失败（${response.status}）`);
      return data;
    }

    const CSS = `
.sbk-root{--sbk-accent:var(--dsw-alias-state-business-primary,#4d6bfe);--sbk-line:var(--dsw-alias-border-l1,rgba(128,128,128,.2));--sbk-line-strong:var(--dsw-alias-border-l2,rgba(128,128,128,.36));--sbk-card:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));--sbk-card-2:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.1));--sbk-text:var(--dsw-alias-label-primary,#18181b);--sbk-dim:var(--dsw-alias-label-secondary,#6b7280);--sbk-faint:var(--dsw-alias-label-tertiary,#9ca3af);--sbk-danger:var(--dsw-alias-state-error-primary,#e5484d);--sbk-ok:var(--dsw-alias-state-success-primary,#2f9e63);--sbk-warn:var(--dsw-alias-state-warn-primary,#c27c0e);position:relative;height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-base,#fff);color:var(--sbk-text);font-size:14px;line-height:1.65}
.sbk-root *{box-sizing:border-box}
.sbk-head{flex:none;padding:14px clamp(14px,3vw,30px) 0;border-bottom:.5px solid var(--sbk-line)}
.sbk-headtop{display:flex;align-items:baseline;gap:8px;min-width:0;padding-left:2px}
.sbk-headbar{display:flex;align-items:center;gap:8px;margin-top:10px}
.sbk-headbar .sbk-select{flex:1 1 auto;min-width:0;max-width:none}
.sbk-title{margin:0;font-size:19px;font-weight:500;line-height:28px;white-space:nowrap;letter-spacing:.01em}
.sbk-sub{color:var(--sbk-dim);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46vw}
.sbk-spacer{flex:1 1 auto}
.sbk-tabs{display:flex;gap:2px;margin-top:12px;overflow-x:auto;scrollbar-width:none}
.sbk-tabs::-webkit-scrollbar{display:none}
.sbk-tab{flex:none;display:inline-flex;align-items:center;gap:6px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--sbk-dim);font:inherit;font-size:13px;line-height:20px;padding:9px 11px;border-radius:9px 9px 0 0;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}
.sbk-tab:hover{background:var(--sbk-card);color:var(--sbk-text)}
.sbk-tab[data-active=true]{color:var(--sbk-accent);border-bottom-color:var(--sbk-accent)}
.sbk-tab-glyph{opacity:.8;font-size:12px}
.sbk-body{flex:1;min-height:0;display:flex;overflow:hidden}
.sbk-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:15px;border:.5px solid var(--sbk-line-strong);background:transparent;color:var(--sbk-text);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,opacity .15s}
.sbk-btn:hover:not(:disabled){background:var(--sbk-card)}
.sbk-btn:disabled{opacity:.45;cursor:default}
.sbk-btn--primary{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.16));border-color:transparent;color:var(--sbk-text);font-weight:500}
.sbk-btn--primary:hover:not(:disabled){filter:brightness(1.08);background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.16))}
.sbk-btn--ghost{border-color:transparent;color:var(--sbk-dim)}
.sbk-btn--ghost:hover:not(:disabled){color:var(--sbk-text)}
.sbk-btn--danger{color:var(--sbk-danger);border-color:transparent}
.sbk-btn--danger:hover:not(:disabled){background:color-mix(in srgb,var(--sbk-danger) 10%,transparent)}
.sbk-btn--sm{height:26px;padding:0 10px;font-size:12px;border-radius:13px}
.sbk-select{height:30px;border-radius:15px;border:.5px solid var(--sbk-line-strong);background:var(--dsw-alias-bg-base,#fff);color:var(--sbk-text);font:inherit;font-size:13px;padding:0 26px 0 12px;max-width:44vw;cursor:pointer}
.sbk-input,.sbk-area{width:100%;border:.5px solid var(--sbk-line-strong);border-radius:12px;background:var(--dsw-alias-bg-base,#fff);color:var(--sbk-text);font:inherit;font-size:13.5px;line-height:1.6;padding:9px 11px;outline:none;transition:border-color .15s}
.sbk-input:focus,.sbk-area:focus{border-color:var(--sbk-accent)}
.sbk-area{resize:vertical;min-height:150px;font-family:inherit}
.sbk-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.7}
.sbk-module{flex:1;min-height:0;display:flex;overflow:hidden}
.sbk-list{flex:0 0 292px;min-width:0;display:flex;flex-direction:column;border-right:.5px solid var(--sbk-line);background:var(--dsw-alias-bg-base,#fff)}
.sbk-list-head{flex:none;display:flex;gap:6px;padding:12px 12px 8px;align-items:center}
.sbk-search{flex:1;min-width:0;height:30px;border-radius:15px;border:.5px solid var(--sbk-line);background:var(--sbk-card);color:var(--sbk-text);font:inherit;font-size:12.5px;padding:0 12px;outline:none}
.sbk-search:focus{border-color:var(--sbk-accent)}
.sbk-list-body{flex:1;min-height:0;overflow:auto;padding:0 8px 8px;scrollbar-width:thin}
.sbk-row{display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;font:inherit;padding:8px 10px;border-radius:10px;cursor:pointer;margin-bottom:2px}
.sbk-row:hover{background:var(--sbk-card)}
.sbk-row[data-active=true]{background:var(--sbk-card-2)}
.sbk-row-title{display:flex;align-items:center;gap:6px;font-weight:500;font-size:13.5px;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sbk-row-snippet{color:var(--sbk-dim);font-size:12px;line-height:1.5;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.sbk-tag{flex:none;font-size:10.5px;line-height:16px;padding:0 6px;border-radius:8px;background:var(--sbk-card-2);color:var(--sbk-dim);font-weight:400}
.sbk-tag--ai{color:var(--sbk-accent);background:color-mix(in srgb,var(--sbk-accent) 12%,transparent)}
.sbk-kws{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.sbk-kw{font-size:10.5px;line-height:16px;padding:0 6px;border-radius:8px;border:.5px solid var(--sbk-line);color:var(--sbk-faint);white-space:nowrap}
.sbk-kw--pin{color:var(--sbk-accent);border-color:color-mix(in srgb,var(--sbk-accent) 45%,transparent)}
.sbk-tlmode{display:flex;align-items:center;gap:8px;padding:0 12px 8px}
.sbk-seg{display:inline-flex;background:var(--sbk-card);border-radius:10px;padding:2px}
.sbk-seg-btn{height:24px;padding:0 10px;border:0;background:transparent;color:var(--sbk-dim);font:inherit;font-size:12px;border-radius:8px;cursor:pointer;white-space:nowrap}
.sbk-seg-btn[data-active=true]{background:var(--dsw-alias-bg-base,#fff);color:var(--sbk-text);box-shadow:0 1px 2px rgba(0,0,0,.14)}
.sbk-auto{flex:1;min-height:0;overflow:auto;padding:20px clamp(12px,2.4vw,24px) 32px;scrollbar-width:thin}
.sbk-auto-head{display:flex;gap:10px;align-items:flex-start;margin-bottom:12px}
.sbk-auto-head h3{margin:0 0 4px;font-size:14.5px;font-weight:600}
.sbk-auto-head p{margin:0}
.sbk-auto-meta{display:flex;flex-direction:column;gap:5px;font-size:12px;line-height:1.6;color:var(--sbk-dim);padding:10px 12px;border:.5px solid var(--sbk-line);border-radius:12px;background:var(--sbk-card)}
.sbk-warn{color:var(--sbk-warn,#c27c0e)}
.sbk-auto-strategy{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:14px}
.sbk-choice{display:flex;flex-direction:column;gap:3px;text-align:left;border:.5px solid var(--sbk-line-strong);border-radius:12px;background:transparent;color:inherit;font:inherit;padding:8px 12px;cursor:pointer;min-width:148px;max-width:260px}
.sbk-choice b{font-size:13px;font-weight:600}
.sbk-choice span{font-size:11.5px;color:var(--sbk-faint);line-height:1.5}
.sbk-choice[data-active=true]{border-color:var(--sbk-accent);background:color-mix(in srgb,var(--sbk-accent) 7%,transparent)}
.sbk-choice:disabled{opacity:.5;cursor:default}
.sbk-ctx{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;margin-top:10px;padding-top:8px;border-top:.5px dashed var(--sbk-line);font-size:11.5px;color:var(--sbk-faint)}
.sbk-ctx b{font-weight:500;color:var(--sbk-dim)}
.sbk-list-foot{flex:none;padding:8px 12px 12px;border-top:.5px solid var(--sbk-line);display:flex;gap:6px;flex-wrap:wrap}
.sbk-editor{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}
.sbk-editor-head{flex:none;display:flex;gap:8px;align-items:center;padding:12px clamp(12px,2.4vw,24px) 8px;flex-wrap:wrap}
.sbk-editor-body{flex:1;min-height:0;overflow:auto;padding:0 clamp(12px,2.4vw,24px) 24px;display:flex;flex-direction:column;gap:8px;scrollbar-width:thin}
.sbk-field{display:flex;flex-direction:column;gap:5px}
.sbk-label{font-size:11.5px;color:var(--sbk-faint);letter-spacing:.03em}
.sbk-hint{font-size:12px;color:var(--sbk-faint);line-height:1.6}
.sbk-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--sbk-faint);padding:40px 24px;text-align:center}
.sbk-empty-glyph{font-size:28px;opacity:.5}
.sbk-empty b{color:var(--sbk-dim);font-weight:500}
.sbk-toolbar{flex:none;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px clamp(12px,2.4vw,24px);border-bottom:.5px solid var(--sbk-line);background:var(--dsw-alias-bg-base,#fff)}
.sbk-chat-time{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sbk-actions{display:inline-flex;gap:6px;align-items:center;flex:none}
.sbk-scroll{flex:1;min-height:0;overflow:auto;padding:16px clamp(12px,2.4vw,24px) 32px;scrollbar-width:thin}
.sbk-narrow{max-width:860px;margin:0 auto;width:100%}
.sbk-card{border:.5px solid var(--sbk-line);border-radius:14px;padding:14px;background:var(--dsw-alias-bg-base,#fff)}
.sbk-card--tint{background:var(--sbk-card)}
.sbk-card h3{margin:0 0 8px;font-size:13.5px;font-weight:500;display:flex;align-items:center;gap:6px}
.sbk-craft{flex:1;min-height:0;display:flex;flex-direction:column}
.sbk-craft-body{flex:1;min-height:0;overflow:auto;padding:16px clamp(12px,2.4vw,24px) 32px;scrollbar-width:thin}
.sbk-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sbk-inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sbk-chat{flex:1;min-height:0;display:flex;flex-direction:column}
.sbk-chat-scroll{flex:1;min-height:0;overflow:auto;padding:16px clamp(12px,2.4vw,24px) 8px;scrollbar-width:thin}
.sbk-msg{max-width:860px;margin:0 auto 14px;display:flex;flex-direction:column}
.sbk-msg--user{align-items:flex-end}
.sbk-bubble{max-width:84%;background:var(--sbk-card-2);border-radius:14px;padding:9px 13px;white-space:pre-wrap;overflow-wrap:anywhere}
.sbk-reply{width:100%;border:.5px solid var(--sbk-line);border-radius:14px;background:var(--sbk-card);padding:14px 16px;overflow-wrap:anywhere}
.sbk-chapter{margin:0 0 10px;font-size:15.5px;font-weight:600;line-height:1.5;letter-spacing:.01em}
.sbk-copy{white-space:pre-wrap;font-size:14.5px;line-height:1.85}
.sbk-timelabel{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--sbk-accent);background:color-mix(in srgb,var(--sbk-accent) 10%,transparent);border-radius:10px;padding:2px 9px;margin-bottom:10px}
.sbk-sect{margin-top:14px;padding-top:12px;border-top:.5px dashed var(--sbk-line)}
.sbk-sect-title{font-size:11.5px;color:var(--sbk-faint);letter-spacing:.06em;margin-bottom:7px;display:flex;align-items:center;gap:6px}
.sbk-status{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:6px}
.sbk-status-cell{background:var(--dsw-alias-bg-base,#fff);border:.5px solid var(--sbk-line);border-radius:10px;padding:6px 9px;min-width:0}
.sbk-status-k{font-size:10.5px;color:var(--sbk-faint);line-height:1.4}
.sbk-status-v{font-size:13px;line-height:1.5;overflow-wrap:anywhere}
.sbk-memory{margin:0;padding-left:16px;color:var(--sbk-dim);font-size:13px;line-height:1.7}
.sbk-hints{display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.sbk-chip{display:inline-flex;align-items:flex-start;gap:7px;text-align:left;border:.5px solid var(--sbk-line-strong);background:var(--dsw-alias-bg-base,#fff);color:var(--sbk-text);font:inherit;font-size:13px;line-height:1.55;padding:6px 11px;border-radius:12px;cursor:pointer;max-width:100%;transition:background .15s,border-color .15s}
.sbk-chip:hover{border-color:var(--sbk-accent);background:color-mix(in srgb,var(--sbk-accent) 7%,transparent)}
.sbk-chip b{color:var(--sbk-accent);font-weight:500;flex:none}
.sbk-composer{flex:none;border-top:.5px solid var(--sbk-line);padding:10px clamp(12px,2.4vw,24px) 14px;background:var(--dsw-alias-bg-base,#fff)}
.sbk-composer-inner{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:8px}
.sbk-composer-row{display:flex;gap:8px;align-items:flex-end}
.sbk-composer textarea{flex:1;min-height:44px;max-height:200px;resize:none;border-radius:14px;border:.5px solid var(--sbk-line-strong);background:var(--dsw-alias-bg-base,#fff);color:var(--sbk-text);font:inherit;font-size:14px;line-height:1.6;padding:11px 13px;outline:none}
.sbk-composer textarea:focus{border-color:var(--sbk-accent)}
.sbk-send{height:44px;padding:0 18px;border-radius:14px}
.sbk-pending{display:inline-flex;align-items:center;gap:8px;color:var(--sbk-dim);font-size:13px}
.sbk-dot{width:6px;height:6px;border-radius:50%;background:var(--sbk-accent);animation:sbk-pulse 1.1s infinite ease-in-out}
.sbk-dot:nth-child(2){animation-delay:.15s}
.sbk-dot:nth-child(3){animation-delay:.3s}
@keyframes sbk-pulse{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}
.sbk-mode{flex:1;min-height:0;overflow:auto;padding:24px clamp(12px,3vw,24px) 40px;scrollbar-width:thin}
.sbk-mode-inner{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
.sbk-modes{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.sbk-modecard{text-align:left;border:.5px solid var(--sbk-line-strong);border-radius:16px;background:var(--dsw-alias-bg-base,#fff);padding:16px;cursor:pointer;font:inherit;color:inherit;transition:border-color .15s,background .15s,box-shadow .15s}
.sbk-modecard:hover{border-color:var(--sbk-accent)}
.sbk-modecard[data-active=true]{border-color:var(--sbk-accent);background:color-mix(in srgb,var(--sbk-accent) 6%,transparent);box-shadow:0 0 0 1px var(--sbk-accent) inset}
.sbk-modecard h3{margin:0 0 6px;font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px}
.sbk-modecard p{margin:0;color:var(--sbk-dim);font-size:12.5px;line-height:1.7}
.sbk-modecard ul{margin:8px 0 0;padding-left:16px;color:var(--sbk-faint);font-size:12px;line-height:1.7}
.sbk-overlay{position:absolute;inset:0;background:rgba(12,14,20,.42);display:flex;align-items:center;justify-content:center;padding:20px;z-index:30;backdrop-filter:blur(2px)}
.sbk-modal{width:min(440px,100%);background:var(--dsw-alias-bg-overlay,#fff);color:var(--sbk-text);border-radius:16px;border:.5px solid var(--sbk-line);box-shadow:0 18px 48px rgba(0,0,0,.28);padding:18px}
.sbk-modal h3{margin:0 0 4px;font-size:15px;font-weight:600}
.sbk-modal p{margin:0 0 12px;color:var(--sbk-dim);font-size:12.5px;line-height:1.6}
.sbk-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.sbk-toast{position:absolute;left:50%;bottom:132px;transform:translateX(-50%);max-width:min(560px,86%);background:var(--dsw-alias-bg-overlay,#1f232b);color:var(--sbk-text);border:.5px solid var(--sbk-line-strong);border-radius:12px;padding:9px 14px;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.25);z-index:40;display:flex;gap:8px;align-items:center}
.sbk-toast[data-kind=error]{border-color:color-mix(in srgb,var(--sbk-danger) 55%,transparent);color:var(--sbk-danger)}
.sbk-busy{position:absolute;top:0;left:0;right:0;height:2px;overflow:hidden;z-index:45}
.sbk-busy:after{content:"";position:absolute;inset:0;width:40%;background:var(--sbk-accent);animation:sbk-bar 1.2s infinite ease-in-out}
@keyframes sbk-bar{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}
.sbk-notice{font-size:12px;color:var(--sbk-faint);line-height:1.6}
.sbk-modal-extra{margin-right:auto}
@media (max-width:820px){
.sbk-list{flex:0 0 auto;max-height:40%;border-right:0;border-bottom:.5px solid var(--sbk-line)}
.sbk-module{flex-direction:column}
.sbk-modes{grid-template-columns:1fr}
.sbk-grid2{grid-template-columns:1fr}
.sbk-sub{display:none}
.sbk-headtop{padding-left:46px}
.sbk-title{font-size:17px;line-height:26px}
.sbk-tabs{margin-top:8px;flex-wrap:wrap;overflow:visible;row-gap:2px}
.sbk-tab{padding:7px 9px;font-size:12.5px;gap:5px;border-radius:8px 8px 0 0}
.sbk-tab[data-active=true]{background:color-mix(in srgb,var(--sbk-accent) 8%,transparent)}
.sbk-tab-glyph{display:none}
.sbk-headbar .sbk-btn{height:28px;padding:0 10px}
.sbk-rounds{display:none}
.sbk-actions{margin-left:auto}
}
`;

    /* ------------------------------------------------------------ 基础件 */

    function Btn({ variant = '', size = '', ...rest }) {
      const cls = ['sbk-btn'];
      if (variant) cls.push(`sbk-btn--${variant}`);
      if (size) cls.push(`sbk-btn--${size}`);
      return h('button', { type: 'button', ...rest, className: `${cls.join(' ')} ${rest.className || ''}`.trim() });
    }

    function Field({ label, children, hint }) {
      return h('label', { className: 'sbk-field' },
        h('span', { className: 'sbk-label' }, label),
        children,
        hint ? h('span', { className: 'sbk-hint' }, hint) : null);
    }

    function Modal({ title, description, children, confirmText = '确定', onConfirm, onCancel, danger, extraAction }) {
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onCancel();
          if (event.key === 'Enter' && event.target?.tagName !== 'TEXTAREA') {
            event.preventDefault();
            onConfirm();
          }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [onCancel, onConfirm]);
      return h('div', { className: 'sbk-overlay', onMouseDown: (event) => { if (event.target === event.currentTarget) onCancel(); } },
        h('div', { className: 'sbk-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
          h('h3', null, title),
          description ? h('p', null, description) : null,
          children,
          h('div', { className: 'sbk-modal-actions' },
            extraAction ? h(Btn, { variant: 'danger', className: 'sbk-modal-extra', onClick: extraAction.onClick }, extraAction.label) : null,
            h(Btn, { variant: 'ghost', onClick: onCancel }, '取消'),
            h(Btn, { variant: danger ? 'danger' : 'primary', onClick: onConfirm }, confirmText))));
    }

    function readFileText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error(`读取 ${file.name} 失败`));
        reader.readAsText(file, 'utf-8');
      });
    }

    function statusOf(mode) {
      return mode === 'game' ? '游戏模式' : mode === 'story' ? '故事模式' : '未开始对话';
    }

    function countChars(text) {
      return String(text || '').replace(/\s/g, '').length;
    }

    /* --------------------------------------------------------------- 页头 */

    function Header({ state, book, tab, setTab, busy, onCreate, onSelect, onSettings }) {
      return h('header', { className: 'sbk-head' },
        h('div', { className: 'sbk-headtop' },
          h('h1', { className: 'sbk-title' }, '故事工坊'),
          h('span', { className: 'sbk-sub' }, book ? `${book.title} · ${statusOf(book.mode)}` : '还没有故事书')),
        h('div', { className: 'sbk-headbar' },
          h('select', {
            className: 'sbk-select',
            value: book?.id || '',
            disabled: busy,
            onChange: (event) => onSelect(event.target.value),
            'aria-label': '切换故事书',
          }, state.books.length === 0
            ? h('option', { value: '' }, '暂无故事书')
            : state.books.map((item) => h('option', { key: item.id, value: item.id }, item.title))),
          h(Btn, { size: 'sm', onClick: onCreate, disabled: busy }, '＋ 新建'),
          book ? h(Btn, { size: 'sm', variant: 'ghost', onClick: onSettings, disabled: busy }, '⚙ 设置') : null),
        h('nav', { className: 'sbk-tabs', role: 'tablist' },
          MODULES.map((item) => h('button', {
            key: item.key,
            type: 'button',
            role: 'tab',
            className: 'sbk-tab',
            'data-active': tab === item.key,
            'aria-selected': tab === item.key,
            title: item.hint,
            onClick: () => setTab(item.key),
          },
          h('span', { className: 'sbk-tab-glyph' }, item.glyph),
          item.label,
          item.key !== 'chat' && book ? h('span', { className: 'sbk-tag' }, String(book.modules[item.key].entries.length)) : null))));
    }

    /* ---------------------------------------------------------- 模块面板 */

    function ModulePanel({ book, module, busy, run, toast, openModal }) {
      const [selectedId, setSelectedId] = useState(null);
      const [draft, setDraft] = useState(null);
      const [query, setQuery] = useState('');
      const [timelineStatus, setTimelineStatus] = useState(null);
      const [strategy, setStrategy] = useState('append');
      const fileRef = useRef(null);
      const meta = MODULES.find((item) => item.key === module);
      const entries = book.modules[module].entries;

      useEffect(() => {
        setSelectedId(null);
        setDraft(null);
        setQuery('');
      }, [module, book.id]);

      const timelineMode = book.settings?.timelineMode === 'auto' ? 'auto' : 'manual';
      const refreshTimelineStatus = async () => {
        try {
          const data = await request('timeline/status', { bookId: book.id });
          setTimelineStatus(data.status);
        } catch {
          /* 状态拉取失败不影响编辑 */
        }
      };

      useEffect(() => {
        if (module !== 'timeline') return undefined;
        let alive = true;
        request('timeline/status', { bookId: book.id })
          .then((data) => { if (alive) setTimelineStatus(data.status); })
          .catch(() => {});
        return () => { alive = false; };
      }, [module, book.id, book.updatedAt]);

      const switchTimelineMode = async (next) => {
        if (next === timelineMode) return;
        await run('book/update', { bookId: book.id, patch: { settings: { timelineMode: next } } }, '切换填写方式…');
      };

      const filtered = entries.filter((entry) => {
        const text = `${entry.title}\n${entry.content}`.toLowerCase();
        return query.trim() === '' || text.includes(query.trim().toLowerCase());
      });

      const pick = (entry) => {
        setSelectedId(entry.id);
        setDraft({
          id: entry.id, title: entry.title, content: entry.content, at: entry.at || '',
          keywordsText: (entry.keywords || []).join('、'), always: Boolean(entry.always),
        });
      };

      const startNew = () => {
        setSelectedId('new');
        setDraft({ id: null, title: '', content: '', at: '', keywordsText: '', always: false });
      };

      const save = async () => {
        if (!draft) return;
        if (!draft.title.trim() && !draft.content.trim()) {
          toast('标题或内容至少写一项', 'error');
          return;
        }
        const keywords = String(draft.keywordsText || '')
          .split(/[、,，;；\s]+/)
          .map((word) => word.trim())
          .filter((word) => word.length >= 2);
        const result = await run('entry/save', {
          bookId: book.id,
          module,
          entry: {
            id: draft.id, title: draft.title, content: draft.content, at: draft.at,
            keywords, always: Boolean(draft.always),
          },
        }, '保存中…');
        if (result) {
          toast(draft.id ? '已保存修改' : '条目已加入知识库');
          const saved = result.entryId ? result.book.modules[module].entries.find((entry) => entry.id === result.entryId) : null;
          if (saved) {
            setSelectedId(saved.id);
            setDraft({
              id: saved.id, title: saved.title, content: saved.content, at: saved.at || '',
              keywordsText: (saved.keywords || []).join('、'), always: Boolean(saved.always),
            });
          }
        }
      };

      const remove = async () => {
        if (!draft?.id) return;
        openModal({
          title: '删除条目',
          description: '删除后无法恢复，确认从该模块移除这条知识？',
          confirmText: '删除',
          danger: true,
          onConfirm: async () => {
            const result = await run('entry/delete', { bookId: book.id, module, id: draft.id }, '删除中…');
            if (result) {
              setSelectedId(null);
              setDraft(null);
              toast('条目已删除');
            }
          },
        });
      };

      const importFiles = async (fileList) => {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        const payload = [];
        for (const file of files) {
          if (file.size > 4 * 1024 * 1024) {
            toast(`${file.name} 超过 4MB，已跳过`, 'error');
            continue;
          }
          payload.push({ name: file.name.replace(/\.[^.]+$/, ''), text: await readFileText(file) });
        }
        if (!payload.length) return;
        const result = await run('entry/import', { bookId: book.id, module, files: payload }, '导入并转为知识库…');
        if (result) toast(`已导入 ${result.added} 个文件，自动转为「${MODULE_LABEL[module]}」知识条目`);
      };

      const buildKeywords = async () => {
        const result = await run('index/build', { bookId: book.id, module }, 'AI 正在为条目生成检索关键词…');
        if (result) toast(result.updated > 0 ? `已为 ${result.updated} 条生成关键词` : '这些条目已有足够关键词');
      };

      const buildTimeline = async () => {
        const result = await run('timeline/build', { bookId: book.id, strategy }, '正在读取世界观与角色，整理时间线…');
        if (!result) return;
        if (result.status) setTimelineStatus(result.status);
        const parts = [];
        if (result.added) parts.push(`新增 ${result.added} 条`);
        if (result.removed) parts.push(`替换 ${result.removed} 条旧事件`);
        toast(parts.length ? `时间线已更新：${parts.join('，')}（${result.chunks} 段）` : '没有发现新的时间线事件');
      };

      const totalChars = entries.reduce((sum, entry) => sum + countChars(entry.content), 0);
      const withKeywords = entries.filter((entry) => (entry.keywords || []).length > 0).length;

      return h('div', { className: 'sbk-module' },
        h('aside', { className: 'sbk-list' },
          h('div', { className: 'sbk-list-head' },
            h('input', {
              className: 'sbk-search',
              placeholder: `搜索${meta.label}…`,
              value: query,
              onChange: (event) => setQuery(event.target.value),
            }),
            h(Btn, { size: 'sm', onClick: startNew, disabled: busy }, '新增')),
          module === 'timeline'
            ? h('div', { className: 'sbk-tlmode' },
              h('div', { className: 'sbk-seg' },
                [{ key: 'manual', label: '手动填写' }, { key: 'auto', label: '自动生成' }].map((item) => h('button', {
                  key: item.key,
                  type: 'button',
                  className: 'sbk-seg-btn',
                  'data-active': timelineMode === item.key,
                  disabled: busy,
                  onClick: () => switchTimelineMode(item.key),
                }, item.label))),
              h('span', { className: 'sbk-notice' },
                timelineStatus?.stale
                  ? (timelineStatus.syncedAt ? '⚠ 设定有更新' : '未同步')
                  : (timelineStatus?.syncedAt ? '已同步' : '')))
            : null,
          h('div', { className: 'sbk-list-body' },
            filtered.length === 0
              ? h('div', { className: 'sbk-empty', style: { padding: '28px 12px' } },
                h('div', { className: 'sbk-empty-glyph' }, meta.glyph),
                h('div', null, entries.length === 0 ? `「${meta.label}」还是空的` : '没有匹配的条目'),
                h('div', { className: 'sbk-hint' }, entries.length === 0 ? '新增一条，或上传文件自动转成知识库' : ''))
              : filtered.map((entry) => h('button', {
                key: entry.id,
                type: 'button',
                className: 'sbk-row',
                'data-active': selectedId === entry.id,
                onClick: () => pick(entry),
              },
              h('div', { className: 'sbk-row-title' },
                entry.at ? h('span', { className: 'sbk-tag' }, entry.at) : null,
                h('span', null, entry.title || '未命名条目'),
                entry.source === 'ai' || entry.source === 'craft' || entry.source === 'auto'
                  ? h('span', { className: 'sbk-tag sbk-tag--ai' }, entry.source === 'auto' ? '记忆' : 'AI')
                  : null),
              h('div', { className: 'sbk-row-snippet' }, entry.content || '（空）'),
              (entry.always || (entry.keywords || []).length)
                ? h('div', { className: 'sbk-kws' },
                  entry.always ? h('span', { className: 'sbk-kw sbk-kw--pin' }, '常驻') : null,
                  (entry.keywords || []).slice(0, 3).map((word) => h('span', { key: word, className: 'sbk-kw' }, word)))
                : null))),
          h('div', { className: 'sbk-list-foot' },
            h(Btn, { size: 'sm', onClick: () => fileRef.current?.click(), disabled: busy }, '⤒ 上传文件'),
            module === 'timeline' ? h(Btn, { size: 'sm', variant: 'ghost', onClick: buildTimeline, disabled: busy }, '✧ 自动整理') : null,
            h(Btn, { size: 'sm', variant: 'ghost', onClick: buildKeywords, disabled: busy }, '⚿ 关键词'),
            h('input', {
              ref: fileRef,
              type: 'file',
              multiple: true,
              accept: '.txt,.md,.markdown,.json,.csv,.yaml,.yml,text/*',
              style: { display: 'none' },
              onChange: (event) => { importFiles(event.target.files); event.target.value = ''; },
            }),
            h('span', { className: 'sbk-notice' }, `${entries.length} 条 · ${totalChars} 字 · 关键词 ${withKeywords}/${entries.length}`))),
        h('section', { className: 'sbk-editor' },
          !draft && module === 'timeline' && timelineMode === 'auto'
            ? h(AutoTimeline, {
              status: timelineStatus,
              busy,
              strategy,
              setStrategy,
              onGenerate: buildTimeline,
              onManual: () => switchTimelineMode('manual'),
              onRefresh: refreshTimelineStatus,
            })
            : !draft
            ? h('div', { className: 'sbk-empty' },
              h('div', { className: 'sbk-empty-glyph' }, meta.glyph),
              h('b', null, meta.label),
              h('div', { className: 'sbk-hint', style: { maxWidth: 360 } },
                module === 'timeline'
                  ? '时间线由「世界观 + 角色」自动提取，也会在每次对话后自动沉淀为记忆库。'
                  : `${meta.hint}。左侧选中条目即可编辑，也可以直接上传文件，内容会自动转为知识库条目。`),
              h(Btn, { variant: 'primary', onClick: startNew }, '＋ 新增条目'))
            : [
              h('div', { className: 'sbk-editor-head', key: 'head' },
                h('span', { className: 'sbk-spacer' }),
                h(Btn, { variant: 'primary', size: 'sm', onClick: save, disabled: busy }, '保存'),
                draft.id ? h(Btn, { variant: 'danger', size: 'sm', onClick: remove, disabled: busy }, '删除') : null,
                h(Btn, { variant: 'ghost', size: 'sm', onClick: () => { setDraft(null); setSelectedId(null); }, disabled: busy }, '关闭')),
              h('div', { className: 'sbk-editor-body', key: 'body' },
                h(Field, { label: '标题' },
                  h('input', {
                    className: 'sbk-input',
                    value: draft.title,
                    placeholder: module === 'character' ? '例如：林照夜' : module === 'timeline' ? '例如：旧王城陷落' : '给这条知识起个名字',
                    onChange: (event) => setDraft({ ...draft, title: event.target.value }),
                  })),
                module === 'timeline'
                  ? h(Field, { label: '故事内时间', hint: '按时间排序与记忆检索都会用到' },
                    h('input', {
                      className: 'sbk-input',
                      value: draft.at,
                      placeholder: '例如：第 3 年·春 / 纪元前 300 年',
                      onChange: (event) => setDraft({ ...draft, at: event.target.value }),
                    }))
                  : null,
                h(Field, { label: '检索关键词', hint: '命中这些词才会把该条带进对话上下文；顿号或逗号分隔' },
                  h('input', {
                    className: 'sbk-input',
                    value: draft.keywordsText || '',
                    placeholder: '例如：沈砚、老板娘、钥匙',
                    onChange: (event) => setDraft({ ...draft, keywordsText: event.target.value }),
                  })),
                h('label', { className: 'sbk-inline', style: { cursor: 'pointer', marginTop: 2 } },
                  h('input', {
                    type: 'checkbox', checked: Boolean(draft.always),
                    onChange: (event) => setDraft({ ...draft, always: event.target.checked }),
                  }),
                  h('span', null, '系统常驻（每轮对话都携带，适合主角与核心设定）')),
                h(Field, { label: '内容', hint: `当前 ${countChars(draft.content)} 字` },
                  h('textarea', {
                    className: 'sbk-area sbk-mono',
                    style: { minHeight: 300 },
                    value: draft.content,
                    placeholder: '直接输入内容，或上传文件后在此微调…',
                    onChange: (event) => setDraft({ ...draft, content: event.target.value }),
                  })),
                h('div', { className: 'sbk-hint' },
                  '这些内容会作为对话时的知识库被引用，且只在本故事书内生效。'))
            ]));
    }

    /* ---------------------------------------------------------- 制作面板 */

    function CraftPanel({ book, busy, run, toast }) {
      const [target, setTarget] = useState('character');
      const [title, setTitle] = useState('');
      const [text, setText] = useState('');
      const [fileName, setFileName] = useState('');
      const [lastCreated, setLastCreated] = useState([]);
      const [lastResult, setLastResult] = useState(null);
      const fileRef = useRef(null);
      const tasks = book.modules.craft.entries.filter((entry) => entry.kind === 'craft-task');

      const loadFile = async (fileList) => {
        const file = fileList?.[0];
        if (!file) return;
        if (file.size > 6 * 1024 * 1024) {
          toast('文件超过 6MB', 'error');
          return;
        }
        setText(await readFileText(file));
        setFileName(file.name);
        if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
      };

      const convert = async () => {
        if (!text.trim()) {
          toast('先粘贴资料或上传文件', 'error');
          return;
        }
        const result = await run('craft/convert', {
          bookId: book.id, target, title: title || '未命名资料', text, fileName: fileName || '手动粘贴',
        }, 'AI 正在分段整理并写入模块（长文档约需 1-2 分钟）…');
        if (result) {
          setLastCreated(result.created || []);
          setLastResult(result);
          const warn = result.warnings?.length ? `，${result.warnings.length} 段未成功` : '';
          toast(`已把资料转换为 ${result.added} 条「${MODULE_LABEL[result.target]}」，分 ${result.chunks || 1} 段处理${warn}`);
        }
      };

      return h('div', { className: 'sbk-craft' },
        h('div', { className: 'sbk-toolbar' },
          h('strong', { style: { fontWeight: 500 } }, '制作 · 资料格式化'),
          h('span', { className: 'sbk-spacer' }),
          h('span', { className: 'sbk-notice' }, 'AI 会把原始资料整理成模块格式并直接写入对应模块列表')),
        h('div', { className: 'sbk-craft-body' },
          h('div', { className: 'sbk-narrow', style: { display: 'flex', flexDirection: 'column', gap: 12 } },
            h('div', { className: 'sbk-card' },
              h('h3', null, '① 选择要写入的模块'),
              h('div', { className: 'sbk-grid2' },
                h(Field, { label: '目标模块' },
                  h('select', {
                    className: 'sbk-select',
                    style: { width: '100%', maxWidth: 'none' },
                    value: target,
                    onChange: (event) => setTarget(event.target.value),
                  }, ['basic', 'world', 'character', 'timeline', 'craft'].map((key) => h('option', { key, value: key }, MODULE_LABEL[key])))),
                h(Field, { label: '资料来源名称' },
                  h('input', {
                    className: 'sbk-input',
                    value: title,
                    placeholder: '例如：角色设定.txt / 小说梗概',
                    onChange: (event) => setTitle(event.target.value),
                  })))),
            h('div', { className: 'sbk-card' },
              h('h3', null, '② 上传文件或直接粘贴'),
              h('div', { className: 'sbk-inline', style: { marginBottom: 8 } },
                h(Btn, { size: 'sm', onClick: () => fileRef.current?.click(), disabled: busy }, '⤒ 选择文件'),
                h('input', {
                  ref: fileRef, type: 'file', accept: '.txt,.md,.markdown,.json,.csv,.yaml,.yml,text/*',
                  style: { display: 'none' },
                  onChange: (event) => { loadFile(event.target.files); event.target.value = ''; },
                }),
                fileName ? h('span', { className: 'sbk-notice' }, `已载入：${fileName}`) : null),
              h('textarea', {
                className: 'sbk-area sbk-mono',
                style: { minHeight: 220, maxHeight: 420 },
                value: text,
                placeholder: '把原始资料粘贴到这里：人物草稿、百科段落、小说片段、设定笔记……',
                onChange: (event) => setText(event.target.value),
              }),
              h('div', { className: 'sbk-inline', style: { marginTop: 10 } },
                h(Btn, { variant: 'primary', onClick: convert, disabled: busy }, '✧ AI 转换并自动入库'),
                h('span', { className: 'sbk-notice' }, '转换结果会写入所选模块，同时留一条转换记录；长文档会自动分段处理，每段失败不影响其它段'))),
            lastCreated.length > 0
              ? h('div', { className: 'sbk-card sbk-card--tint' },
                h('h3', null, `✓ 已入库 ${lastCreated.length} 条${lastResult?.chunks > 1 ? `（分 ${lastResult.chunks} 段处理）` : ''}`),
                lastResult?.warnings?.length
                  ? h('ul', { className: 'sbk-memory', style: { color: 'var(--sbk-warn)', marginBottom: 8 } },
                    lastResult.warnings.map((line, index) => h('li', { key: index }, line)))
                  : null,
                h('ul', { className: 'sbk-memory', style: { color: 'var(--sbk-text)' } },
                  lastCreated.map((entry) => h('li', { key: entry.id }, `${entry.title}${entry.at ? `（${entry.at}）` : ''}`))))
              : null,
            h('div', { className: 'sbk-card' },
              h('h3', null, `转换记录（${tasks.length}）`),
              tasks.length === 0
                ? h('div', { className: 'sbk-hint' }, '还没有转换记录。上传一份资料试试，AI 会把它变成可入库的模块条目。')
                : tasks.map((task) => h('div', { key: task.id, style: { padding: '8px 0', borderTop: '.5px solid var(--sbk-line)' } },
                  h('div', { style: { fontWeight: 500, fontSize: 13.5 } }, task.title),
                  h('div', { className: 'sbk-row-snippet', style: { WebkitLineClamp: 4, lineClamp: 4 } }, task.content)))))));
    }

    /* ---------------------------------------------------------- 对话面板 */

    function AutoTimeline({ status, busy, strategy, setStrategy, onGenerate, onManual, onRefresh }) {
      const syncedAt = status?.syncedAt
        ? new Date(status.syncedAt).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '';
      return h('div', { className: 'sbk-auto' },
        h('div', { className: 'sbk-auto-head' },
          h('div', null,
            h('h3', null, '🤖 自动整理时间线'),
            h('p', { className: 'sbk-hint' }, '读取「世界观 + 角色」的设定，提取历史事件与当前局势，按故事内时间排序写入时间线。')),
          h('span', { className: 'sbk-spacer' }),
          h(Btn, { size: 'sm', variant: 'ghost', onClick: onManual, disabled: busy }, '改用手动填写')),
        h('div', { className: 'sbk-auto-meta' },
          h('span', null, `来源：世界观 ${status?.counts?.world ?? 0} 条 · 角色 ${status?.counts?.character ?? 0} 条`),
          h('span', null, `已有事件 ${status?.counts?.events ?? 0} 条（AI ${status?.counts?.aiEvents ?? 0} / 手动 ${status?.counts?.manualEvents ?? 0}）· 记忆 ${status?.counts?.memories ?? 0} 条`),
          syncedAt
            ? h('span', null, `上次整理：${syncedAt}，${status.meta.strategy === 'replace' ? '覆盖' : '追加'} ${status.meta.added} 条（${status.meta.chunks} 段）`)
            : h('span', null, '还没有自动生成过时间线'),
          status?.stale && status?.syncedAt
            ? h('span', { className: 'sbk-warn' }, '⚠ 世界观或角色在上次整理后有改动，建议重新整理')
            : null),
        h('div', { className: 'sbk-auto-strategy' },
          h('span', { className: 'sbk-label' }, '处理方式'),
          [
            { key: 'append', label: '追加', hint: '保留现有条目，只补新事件' },
            { key: 'replace', label: '覆盖', hint: '先删上次 AI 生成的事件再重建，手动条目与对话记忆保留' },
          ].map((item) => h('button', {
            key: item.key,
            type: 'button',
            className: 'sbk-choice',
            'data-active': strategy === item.key,
            disabled: busy,
            onClick: () => setStrategy(item.key),
          }, h('b', null, item.label), h('span', null, item.hint)))),
        h('div', { className: 'sbk-inline', style: { marginTop: 14 } },
          h(Btn, { variant: 'primary', onClick: onGenerate, disabled: busy }, '✧ 立即整理'),
          h(Btn, { variant: 'ghost', size: 'sm', onClick: onRefresh, disabled: busy }, '刷新状态'),
          h('span', { className: 'sbk-notice' }, '手动条目与对话沉淀的记忆不会被覆盖')));
    }

    function StatusGrid({ rows }) {
      if (!rows || rows.length === 0) return null;
      return h('div', { className: 'sbk-status' }, rows.map((row, index) => h('div', { key: `${index}-${row.label}`, className: 'sbk-status-cell' },
        row.label ? h('div', { className: 'sbk-status-k' }, row.label) : null,
        h('div', { className: 'sbk-status-v' }, row.value))));
    }

    function ContextNote({ context }) {
      if (!context) return null;
      return h('div', { className: 'sbk-ctx' },
        h('span', null, `本轮注入：${context.retrieved || 0} 条检索 + ${context.resident || 0} 条常驻 · ${context.chars || 0} 字`),
        context.keywords?.length ? h('span', null, `命中关键词：${context.keywords.slice(0, 6).join('、')}`) : null,
        context.mention?.length ? h('span', null, `用户触发：${context.mention.slice(0, 4).map((row) => row.title).join('、')}`) : null,
        context.echo?.length ? h('span', null, `AI 触发：${context.echo.slice(0, 4).map((row) => row.title).join('、')}`) : null);
    }

    function Hints({ hints, onPick }) {
      if (!hints || hints.length === 0) return null;
      return h('div', { className: 'sbk-sect' },
        h('div', { className: 'sbk-sect-title' }, '后续发展提示'),
        h('div', { className: 'sbk-hints' }, hints.map((hint, index) => h('button', {
          key: `${index}-${hint}`,
          type: 'button',
          className: 'sbk-chip',
          onClick: () => onPick(hint),
          title: '点击填入输入框',
        },
        h('b', null, `${index + 1}.`),
        h('span', null, hint)))));
    }

    function Reply({ message, onPick }) {
      const parsed = message.parsed || {};
      if (parsed.mode === 'game') {
        return h('div', { className: 'sbk-reply' },
          parsed.time ? h('div', { className: 'sbk-timelabel' }, `⏱ ${parsed.time}`) : null,
          h('div', { className: 'sbk-copy' }, parsed.body || message.text),
          parsed.status?.length
            ? h('div', { className: 'sbk-sect' }, h('div', { className: 'sbk-sect-title' }, '状态栏'), h(StatusGrid, { rows: parsed.status }))
            : null,
          parsed.memory?.length
            ? h('div', { className: 'sbk-sect' },
              h('div', { className: 'sbk-sect-title' }, '记忆库'),
              h('ul', { className: 'sbk-memory' }, parsed.memory.map((line, index) => h('li', { key: `${index}-${line}` }, line))))
            : null,
          h(Hints, { hints: parsed.hints, onPick }),
          ContextNote({ context: message.context }));
      }
      return h('div', { className: 'sbk-reply' },
        parsed.chapterTitle ? h('h3', { className: 'sbk-chapter' }, parsed.chapterTitle) : null,
        h('div', { className: 'sbk-copy' }, parsed.body || message.text),
        h(Hints, { hints: parsed.hints, onPick }),
        ContextNote({ context: message.context }));
    }

    function ModeStart({ book, busy, run, toast }) {
      const [mode, setMode] = useState('story');
      const [playerName, setPlayerName] = useState(book.player?.name || '');
      const [playerDesc, setPlayerDesc] = useState(book.player?.desc || '');
      const [styleHint, setStyleHint] = useState(book.settings.styleHint || '');

      const start = async () => {
        const result = await run('chat/start', {
          bookId: book.id, mode, playerName, playerDesc, styleHint,
        }, '准备故事…');
        if (result) toast(mode === 'game' ? '游戏开始，祝你好运' : '故事开始');
      };

      const hasKnowledge = book.modules.basic.entries.length + book.modules.world.entries.length + book.modules.character.entries.length > 0;

      return h('div', { className: 'sbk-mode' },
        h('div', { className: 'sbk-mode-inner' },
          h('div', null,
            h('h2', { style: { margin: '0 0 6px', fontSize: 20, fontWeight: 600 } }, '选择游玩模式'),
            h('div', { className: 'sbk-hint' }, hasKnowledge ? '当前故事书的知识库会实时注入对话。模式确定后即开始第一章。' : '这本故事书还没有知识库内容，可以先回各模块补充设定，也可以直接开始。')),
          h('div', { className: 'sbk-modes' },
            h('button', {
              type: 'button', className: 'sbk-modecard', 'data-active': mode === 'story',
              onClick: () => setMode('story'),
            },
            h('h3', null, '📖 故事模式'),
            h('p', null, '以章节形式输出故事：章节名 + 正文 + 后续发展提示（3-5 条），像互动小说一样推进。'),
            h('ul', null, h('li', null, '你既是读者也是引导者'), h('li', null, '输入行动或方向，故事继续'), h('li', null, '每章结尾给出可选项'))),
            h('button', {
              type: 'button', className: 'sbk-modecard', 'data-active': mode === 'game',
              onClick: () => setMode('game'),
            },
            h('h3', null, '🎲 游戏模式'),
            h('p', null, '严格规则文字 RPG：游戏内时间 + 正文（≤1500 字）+ 状态栏 + 记忆库 + 后续发展提示。'),
            h('ul', null, h('li', null, '拥有角色状态与背包'), h('li', null, '行动有代价，世界有规则'), h('li', null, '记忆库随剧情自动沉淀')))),
          mode === 'game'
            ? h('div', { className: 'sbk-card' },
              h('h3', null, '你的角色'),
              h('div', { className: 'sbk-grid2' },
                h(Field, { label: '名字' },
                  h('input', { className: 'sbk-input', value: playerName, placeholder: '例如：顾青梧', onChange: (event) => setPlayerName(event.target.value) })),
                h(Field, { label: '初始设定（可选）', hint: '会写入角色模块，作为状态栏与判定依据' },
                  h('input', { className: 'sbk-input', value: playerDesc, placeholder: '例如：落魄剑客，左臂有旧伤', onChange: (event) => setPlayerDesc(event.target.value) }))))
            : null,
          h('div', { className: 'sbk-card' },
            h('h3', null, '风格要求（可选）'),
            h('textarea', {
              className: 'sbk-area',
              style: { minHeight: 78 },
              value: styleHint,
              placeholder: '例如：克苏鲁式压抑氛围，多用短句与环境细节，避免直白抒情。',
              onChange: (event) => setStyleHint(event.target.value),
            })),
          h('div', { className: 'sbk-inline', style: { justifyContent: 'flex-end' } },
            h(Btn, { variant: 'primary', onClick: start, disabled: busy }, mode === 'game' ? '开始游戏' : '开始故事'))));
    }

    function ChatPanel({ book, busy, run, toast, openModal }) {
      const [input, setInput] = useState('');
      const scrollRef = useRef(null);
      const messages = book.chat.messages;

      useEffect(() => {
        const node = scrollRef.current;
        if (node) node.scrollTop = node.scrollHeight;
      }, [messages.length, busy]);

      const pickHint = (hint) => setInput(hint);

      const send = async () => {
        if (busy) return;
        const text = input.trim();
        if (!text) {
          toast('输入你的行动或方向', 'error');
          return;
        }
        setInput('');
        const result = await run('chat/send', { bookId: book.id, message: text }, book.mode === 'game' ? 'GM 正在推演…' : '正在续写这一章…');
        if (result && result.memoryAdded > 0) toast(`+${result.memoryAdded} 条记忆已写入时间线`);
      };

      const continueStory = async () => {
        if (busy) return;
        const result = await run('chat/send', { bookId: book.id, message: '' }, book.mode === 'game' ? 'GM 正在推演…' : '正在续写这一章…');
        if (result && result.memoryAdded > 0) toast(`+${result.memoryAdded} 条记忆已写入时间线`);
      };

      if (!book.mode) return h(ModeStart, { book, busy, run, toast });

      const switchMode = () => {
        openModal({
          title: '切换模式',
          description: '切换模式会清空当前对话记录（模块知识库保留），并从第一章重新开始。',
          confirmText: '切换并重开',
          danger: true,
          onConfirm: async () => {
            const result = await run('chat/mode', { bookId: book.id, mode: book.mode === 'game' ? 'story' : 'game' }, '切换中…');
            if (result) toast(`已切换到${book.mode === 'game' ? '故事模式' : '游戏模式'}`);
          },
        });
      };

      const reset = () => {
        openModal({
          title: '清空对话',
          description: '只清空对话记录与章节计数，各模块知识库与时间线记忆不会删除。',
          confirmText: '清空',
          danger: true,
          onConfirm: async () => {
            const result = await run('chat/reset', { bookId: book.id }, '清空中…');
            if (result) toast('对话已清空');
          },
        });
      };

      return h('div', { className: 'sbk-chat' },
        h('div', { className: 'sbk-toolbar' },
          h('span', { className: 'sbk-tag', style: { color: 'var(--sbk-accent)' } }, book.mode === 'game' ? '🎲 游戏模式' : '📖 故事模式'),
          book.mode === 'game' && book.gameState?.time ? h('span', { className: 'sbk-chat-time sbk-notice' }, `游戏内时间：${book.gameState.time}`) : null,
          book.mode === 'story' ? h('span', { className: 'sbk-chat-time sbk-notice' }, `下一章：第 ${book.chapterIndex} 章`) : null,
          h('span', { className: 'sbk-spacer' }),
          h('span', { className: 'sbk-rounds sbk-notice' }, `${messages.filter((m) => m.role === 'assistant').length} 轮`),
          h('span', { className: 'sbk-actions' },
            h(Btn, { size: 'sm', variant: 'ghost', onClick: switchMode, disabled: busy }, '切换模式'),
            h(Btn, { size: 'sm', variant: 'ghost', onClick: reset, disabled: busy }, '清空'))),
        h('div', { className: 'sbk-chat-scroll', ref: scrollRef },
          messages.length === 0
            ? h('div', { className: 'sbk-empty' },
              h('div', { className: 'sbk-empty-glyph' }, book.mode === 'game' ? '🎲' : '📖'),
              h('b', null, book.mode === 'game' ? '输入你的第一个行动' : '写下故事的开端'),
              h('div', { className: 'sbk-hint', style: { maxWidth: 380 } },
                book.mode === 'game'
                  ? '例如「推开酒馆的门，环视四周」。GM 只会描写世界，不会替你做决定。'
                  : '例如「写一个雨夜里，陌生人在驿站认出了主角」。'))
            : messages.map((message) => message.role === 'user'
              ? h('div', { key: message.id, className: 'sbk-msg sbk-msg--user' },
                h('div', { className: 'sbk-bubble' }, message.text))
              : h('div', { key: message.id, className: 'sbk-msg' },
                h(Reply, { message, onPick: pickHint }))),
          busy
            ? h('div', { className: 'sbk-msg' },
              h('div', { className: 'sbk-reply', style: { display: 'flex', alignItems: 'center', gap: 10 } },
                h('span', { className: 'sbk-pending' },
                  h('span', { className: 'sbk-dot' }), h('span', { className: 'sbk-dot' }), h('span', { className: 'sbk-dot' }),
                  h('span', null, book.mode === 'game' ? 'GM 正在推演…' : '正在续写…'))))
            : null),
        h('div', { className: 'sbk-composer' },
          h('div', { className: 'sbk-composer-inner' },
            h('div', { className: 'sbk-composer-row' },
              h('textarea', {
                value: input,
                placeholder: book.mode === 'game' ? '描述你的行动……（Ctrl/⌘ + Enter 发送）' : '写下剧情走向或角色行动……（Ctrl/⌘ + Enter 发送）',
                onChange: (event) => setInput(event.target.value),
                onKeyDown: (event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault();
                    send();
                  }
                },
                rows: 2,
              }),
              h(Btn, { variant: 'primary', className: 'sbk-send', onClick: send, disabled: busy }, '发送')),
            h('div', { className: 'sbk-inline' },
              h(Btn, { size: 'sm', variant: 'ghost', onClick: continueStory, disabled: busy }, '继续（不输入）'),
              h('span', { className: 'sbk-notice' }, book.mode === 'game' ? '游戏模式会实时维护状态栏与记忆库' : '故事模式每章末尾给出 3-5 条后续发展提示')))));
    }

    /* --------------------------------------------------------------- 页面 */

    function StorybookPage() {
      const [state, setState] = useState({ books: [], activeBookId: null });
      const [book, setBook] = useState(null);
      const [tab, setTab] = useState('basic');
      const [busy, setBusy] = useState('');
      const [toastState, setToastState] = useState(null);
      const [modal, setModal] = useState(null);
      const [loaded, setLoaded] = useState(false);
      const toastTimer = useRef(null);

      const toast = useCallback((text, kind) => {
        setToastState({ text, kind: kind || 'ok' });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastState(null), kind === 'error' ? 6000 : 3600);
      }, []);

      useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

      const applyResponse = useCallback((data) => {
        if (!data) return;
        if (Array.isArray(data.books)) setState({ books: data.books, activeBookId: data.activeBookId ?? null });
        if (data.book) setBook(data.book);
      }, []);

      const run = useCallback(async (action, payload, label) => {
        setBusy(label || '处理中…');
        try {
          const data = await request(action, payload);
          applyResponse(data);
          return data;
        } catch (error) {
          toast(error?.message || String(error), 'error');
          return null;
        } finally {
          setBusy('');
        }
      }, [applyResponse, toast]);

      useEffect(() => {
        let alive = true;
        (async () => {
          try {
            const data = await request('state');
            if (!alive) return;
            applyResponse(data);
            if (data.activeBookId) {
              const full = await request('book', { id: data.activeBookId });
              if (alive && full.book) setBook(full.book);
            }
          } catch (error) {
            if (alive) toast(error?.message || String(error), 'error');
          } finally {
            if (alive) setLoaded(true);
          }
        })();
        return () => { alive = false; };
      }, [applyResponse, toast]);

      const selectBook = async (id) => {
        if (!id || id === book?.id) return;
        setBusy('切换故事书…');
        try {
          const data = await request('book/select', { id });
          applyResponse(data);
          setTab('basic');
        } catch (error) {
          toast(error?.message || String(error), 'error');
        } finally {
          setBusy('');
        }
      };

      const createBook = () => {
        setModal({
          kind: 'create',
          title: '新建故事书',
          description: '每本故事书拥有彼此隔离的模块与知识库，互不引用。',
          value: '',
          placeholder: '例如：雾港旧事',
          confirmText: '创建',
        });
      };

      const deleteBook = () => {
        setModal({
          kind: 'delete',
          title: '删除故事书',
          description: `将永久删除《${book?.title}》及其全部模块内容与对话记录，无法恢复。`,
          confirmText: '删除',
          danger: true,
        });
      };

      const settingsBook = () => {
        setModal({
          kind: 'settings',
          title: '故事书设置',
          value: book?.title || '',
          styleHint: book?.settings?.styleHint || '',
          autoMemory: book?.settings?.autoMemory !== false,
          budget: book?.settings?.knowledgeBudget || 12000,
          resident: book?.settings?.residentBudget || 2600,
          retrieval: book?.settings?.retrievalBudget || 4200,
          confirmText: '保存',
        });
      };

      const confirmModal = async () => {
        if (!modal) return;
        const current = modal;
        setModal(null);
        if (current.kind === 'create') {
          const data = await run('book/create', { title: current.value, template: current.template !== false }, '创建中…');
          if (data) {
            setTab('basic');
            toast('故事书已创建，可以先补充基础设定');
          }
        } else if (current.kind === 'delete') {
          const data = await run('book/delete', { id: book.id }, '删除中…');
          if (data) {
            setBook(null);
            setTab('basic');
            toast('故事书已删除');
          }
        } else if (current.kind === 'settings') {
          if (current.value && current.value.trim() && current.value.trim() !== book.title) {
            await run('book/rename', { id: book.id, title: current.value.trim() }, '重命名…');
          }
          const data = await run('book/update', {
            bookId: book.id,
            patch: {
              settings: {
                styleHint: current.styleHint,
                autoMemory: current.autoMemory,
                knowledgeBudget: Number(current.budget) || 12000,
                residentBudget: Number(current.resident) || 2600,
                retrievalBudget: Number(current.retrieval) || 4200,
              },
            },
          }, '保存设置…');
          if (data) toast('设置已保存');
        }
      };

      const moduleMeta = MODULES.find((item) => item.key === tab) || MODULES[0];

      return h('div', { className: 'sbk-root' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        busy ? h('div', { className: 'sbk-busy' }) : null,
        h(Header, {
          state, book, tab, setTab, busy,
          onCreate: createBook,
          onSelect: selectBook,
          onSettings: settingsBook,
        }),
        h('div', { className: 'sbk-body' },
          !loaded
            ? h('div', { className: 'sbk-empty' }, h('span', { className: 'sbk-pending' }, h('span', { className: 'sbk-dot' }), '正在载入故事书…'))
            : !book
              ? h('div', { className: 'sbk-empty' },
                h('div', { className: 'sbk-empty-glyph' }, '✧'),
                h('b', null, '还没有故事书'),
                h('div', { className: 'sbk-hint', style: { maxWidth: 380 } },
                  '先创建一本故事书。之后可以在「基础设定 / 世界观 / 角色 / 时间线 / 制作」里积累知识，再进入「对话」开始故事或游戏。'),
                h(Btn, { variant: 'primary', onClick: createBook }, '＋ 创建故事书'))
              : tab === 'chat'
                ? h(ChatPanel, { book, busy, run, toast, openModal: setModal })
                : tab === 'craft'
                  ? h(CraftPanel, { book, busy, run, toast })
                  : h(ModulePanel, { book, module: tab, busy, run, toast, openModal: setModal })),
        toastState
          ? h('div', { className: 'sbk-toast', 'data-kind': toastState.kind, role: 'status' }, toastState.text)
          : null,
        modal
          ? h(Modal, {
            title: modal.title,
            description: modal.description,
            confirmText: modal.confirmText,
            danger: modal.danger,
            onCancel: () => setModal(null),
            onConfirm: confirmModal,
            extraAction: modal.kind === 'settings' ? { label: '删除本书', onClick: deleteBook } : null,
          },
          modal.kind === 'create'
            ? h(Field, { label: '故事书名称' },
              h('input', {
                className: 'sbk-input', autoFocus: true, value: modal.value,
                placeholder: modal.placeholder,
                onChange: (event) => setModal({ ...modal, value: event.target.value }),
              }))
            : modal.kind === 'settings'
                ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
                  h(Field, { label: '故事书名称' },
                    h('input', {
                      className: 'sbk-input', value: modal.value,
                      onChange: (event) => setModal({ ...modal, value: event.target.value }),
                    })),
                  h(Field, { label: '风格要求', hint: '每次生成都会带上这段要求' },
                    h('textarea', {
                      className: 'sbk-area', style: { minHeight: 80 }, value: modal.styleHint,
                      onChange: (event) => setModal({ ...modal, styleHint: event.target.value }),
                    })),
                  h(Field, { label: '常驻预算（字符）', hint: '系统常驻块：基础设定 + 标记常驻的条目 + 最近记忆' },
                    h('input', {
                      className: 'sbk-input', type: 'number', min: 600, max: 20000, step: 200, value: modal.resident,
                      onChange: (event) => setModal({ ...modal, resident: event.target.value }),
                    })),
                  h(Field, { label: '检索预算（字符）', hint: '用户触发 / AI 触发命中的条目，每轮最多注入这么多' },
                    h('input', {
                      className: 'sbk-input', type: 'number', min: 800, max: 30000, step: 200, value: modal.retrieval,
                      onChange: (event) => setModal({ ...modal, retrieval: event.target.value }),
                    })),
                  h('label', { className: 'sbk-inline', style: { cursor: 'pointer' } },
                    h('input', {
                      type: 'checkbox', checked: modal.autoMemory,
                      onChange: (event) => setModal({ ...modal, autoMemory: event.target.checked }),
                    }),
                    h('span', null, '对话后自动沉淀记忆到时间线')))
                : null)
          : null);
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('storybook', {
          zh: { 'panel.title': '故事工坊' },
          en: { 'panel.title': 'Story Workshop' },
        }), 'storybook: dictionaries');

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'storybook',
          locale: 'storybook',
        }, StorybookPage));

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'storybook',
          order: 20,
          locale: 'storybook',
          label: () => '故事工坊',
        }, StorybookIcon));
      },
    };

    function StorybookIcon({ size }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true,
      },
      h('path', { d: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H12v17H6.5A2.5 2.5 0 0 0 4 22V5.5Z', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round' }),
      h('path', { d: 'M20 5.5A2.5 2.5 0 0 0 17.5 3H12v17h5.5A2.5 2.5 0 0 1 20 22V5.5Z', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round' }),
      h('path', { d: 'M15.5 1.8l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z', fill: 'currentColor' }));
    }
  },
});
