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
      { key: 'chat', label: '故事', glyph: '✧', hint: '多对话 · 流式输出' },
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

    async function streamChat(payload, handlers) {
      let response;
      try {
        response = await fetch(`${API}?action=chat/stream`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'chat/stream', ...payload }),
          credentials: 'same-origin',
        });
      } catch (error) {
        throw new Error(`无法连接故事工坊服务：${error?.message || error}`);
      }
      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => '');
        let message = `流式请求失败（${response.status}）`;
        try { message = JSON.parse(text).error || message; } catch { /* 非 JSON 错误体 */ }
        throw new Error(message);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index = buffer.indexOf('\n\n');
        while (index >= 0) {
          const block = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const line = block.split('\n').find((item) => item.startsWith('data: '));
          index = buffer.indexOf('\n\n');
          if (!line) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          if (event.type === 'delta') handlers.onDelta?.(event.text);
          else if (event.type === 'done') { finished = true; handlers.onDone?.(event); }
          else if (event.type === 'error') { finished = true; handlers.onError?.(event.error); }
        }
      }
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
.sbk-head--chat{padding-top:10px;padding-bottom:6px}
.sbk-chathead{display:flex;align-items:center;gap:8px;min-height:36px}
.sbk-iconbtn{width:32px;height:32px;border-radius:10px;border:.5px solid transparent;background:transparent;color:var(--sbk-text);font:inherit;font-size:20px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex:none}
.sbk-iconbtn:hover{background:var(--sbk-card)}
.sbk-iconbtn:disabled{opacity:.4;cursor:default}
.sbk-chat-title{flex:1;min-width:0;display:flex;align-items:baseline;gap:8px;border:0;background:transparent;color:var(--sbk-text);font:inherit;font-size:15px;font-weight:600;text-align:left;cursor:pointer;padding:4px 6px;border-radius:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sbk-chat-title:hover{background:var(--sbk-card)}
.sbk-chat-sub{font-size:11.5px;font-weight:400;color:var(--sbk-faint);flex:none}
.sbk-storylist{flex:1;min-height:0;overflow:auto;padding:18px clamp(12px,2.4vw,24px) 32px;scrollbar-width:thin}
.sbk-storylist-head{display:flex;align-items:flex-end;gap:10px;max-width:900px;margin:0 auto 16px}
.sbk-storylist-title{margin:0;font-size:19px;font-weight:600}
.sbk-storylist-head p{margin:4px 0 0}
.sbk-convs{max-width:900px;margin:0 auto;display:flex;flex-direction:column;gap:8px}
.sbk-conv{display:flex;flex-direction:column;gap:3px;text-align:left;border:.5px solid var(--sbk-line);background:var(--dsw-alias-bg-base,#fff);color:inherit;font:inherit;padding:11px 14px;border-radius:14px;cursor:pointer;transition:border-color .15s,background .15s}
.sbk-conv:hover{border-color:var(--sbk-line-strong);background:var(--sbk-card)}
.sbk-conv[data-active=true]{border-color:var(--sbk-accent)}
.sbk-conv-head{display:flex;align-items:center;gap:6px;min-width:0}
.sbk-conv-title{font-size:14.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sbk-conv-meta{font-size:11.5px;color:var(--sbk-faint)}
.sbk-conv-preview{font-size:12.5px;color:var(--sbk-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sbk-convswitch{flex:none;height:44px;max-width:36%;display:inline-flex;align-items:center;gap:4px;padding:0 10px;border-radius:12px;border:.5px solid var(--sbk-line-strong);background:var(--sbk-card);color:var(--sbk-text);font:inherit;font-size:12.5px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sbk-convswitch:hover:not(:disabled){border-color:var(--sbk-accent)}
.sbk-convswitch:disabled{opacity:.5;cursor:default}
.sbk-convswitch-caret{color:var(--sbk-faint);font-size:10px;flex:none}
.sbk-menu-mask{position:absolute;inset:0;z-index:50}
.sbk-menu{position:absolute;min-width:196px;background:var(--dsw-alias-bg-overlay,#fff);border:.5px solid var(--sbk-line-strong);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.28);padding:5px;display:flex;flex-direction:column}
.sbk-menu-item{text-align:left;border:0;background:transparent;color:var(--sbk-text);font:inherit;font-size:13px;padding:9px 10px;border-radius:8px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sbk-menu-item:hover:not(:disabled){background:var(--sbk-card)}
.sbk-menu-item:disabled{opacity:.4;cursor:default}
.sbk-menu-item--danger{color:var(--sbk-danger)}
.sbk-scope{height:24px;padding:0 8px;border-radius:8px;border:.5px solid var(--sbk-line);background:transparent;color:var(--sbk-dim);font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap}
.sbk-scope[data-active=true]{border-color:var(--sbk-accent);color:var(--sbk-accent)}
.sbk-usage{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;margin-top:10px;padding-top:8px;border-top:.5px dashed var(--sbk-line);font-size:11.5px;color:var(--sbk-faint);font-variant-numeric:tabular-nums}
.sbk-usage-total{font-size:11.5px;color:var(--sbk-faint);white-space:nowrap;font-variant-numeric:tabular-nums}
.sbk-empty--compact{gap:10px;padding:22px 16px}
.sbk-details{max-width:380px;text-align:left;color:var(--sbk-faint);font-size:12px}
.sbk-details summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:6px;padding:2px 0}
.sbk-details summary::-webkit-details-marker{display:none}
.sbk-details summary:before{content:'▸';color:var(--sbk-faint)}
.sbk-details[open] summary:before{content:'▾'}
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

    function moduleIntro(module) {
      if (module === 'basic') return '这里写的内容会作为系统提示词注入对话：类型、基调、叙事底线、禁止项等。它在输出格式规则之内优先遵守，建议写得像给作者的指令。';
      if (module === 'timeline') return '时间线可以手动逐条填写，也可以切到「自动生成」，由 AI 读取「世界观 + 角色」提取事件；每次对话后还会自动沉淀记忆。';
      if (module === 'craft') return '粘贴或上传原始资料，AI 会按目标模块的格式整理成条目并自动入库，同时留一条转换记录。';
      return `${MODULES.find((item) => item.key === module)?.hint || ''}。左侧选中条目即可编辑，也可以直接上传文件，内容会自动转为知识库条目。`;
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

    function ModulePanel({ book, module, busy, run, toast, openModal, activeConversationId }) {
      const [selectedId, setSelectedId] = useState(null);
      const [draft, setDraft] = useState(null);
      const [query, setQuery] = useState('');
      const [timelineStatus, setTimelineStatus] = useState(null);
      const [strategy, setStrategy] = useState('append');
      const fileRef = useRef(null);
      const meta = MODULES.find((item) => item.key === module);
      const allEntries = book.modules[module].entries;
      const [scope, setScope] = useState('current');
      const entries = module === 'timeline' && scope === 'current'
        ? allEntries.filter((entry) => !entry.conversationId || entry.conversationId === activeConversationId)
        : allEntries;

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
              h('button', {
                type: 'button',
                className: 'sbk-scope',
                'data-active': scope === 'current',
                title: '对话沉淀的记忆按对话隔离',
                onClick: () => setScope(scope === 'current' ? 'all' : 'current'),
              }, scope === 'current' ? '仅本对话' : '全部对话'),
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
            ? (entries.length === 0
              ? h('div', { className: 'sbk-empty' },
                h('div', { className: 'sbk-empty-glyph' }, meta.glyph),
                h('b', null, meta.label),
                h('div', { className: 'sbk-hint', style: { maxWidth: 380 } }, moduleIntro(module)),
                h(Btn, { variant: 'primary', onClick: startNew }, '＋ 新增条目'))
              : h('div', { className: 'sbk-empty sbk-empty--compact' },
                h('b', null, `共 ${entries.length} 条${meta.label}`),
                h(Btn, { variant: 'primary', size: 'sm', onClick: startNew }, '＋ 新增条目'),
                h('details', { className: 'sbk-details' },
                  h('summary', null, `${meta.label}模块说明`),
                  h('div', { className: 'sbk-hint', style: { marginTop: 6 } }, moduleIntro(module)))))
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
                  module === 'basic'
                    ? '这段内容会作为系统提示词注入对话（在输出格式规则之内优先遵守），只在本故事书内生效。'
                    : '这些内容会作为对话时的知识库被引用，且只在本故事书内生效。'))
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

    function fmtTokens(value) {
      const number = Number(value) || 0;
      if (number >= 10000) return `${(number / 1000).toFixed(0)}k`;
      if (number >= 1000) return `${(number / 1000).toFixed(1)}k`;
      return String(number);
    }

    function UsageNote({ message }) {
      const usage = message.usage;
      if (!usage && !message.truncated) return null;
      return h('div', { className: 'sbk-usage' },
        usage ? h('span', null, `↑ ${fmtTokens(usage.inputTokens)} · ↓ ${fmtTokens(usage.outputTokens)} tokens`) : null,
        usage?.reasoningTokens ? h('span', null, `思考 ${fmtTokens(usage.reasoningTokens)}`) : null,
        message.truncated ? h('span', { className: 'sbk-warn' }, '输出达到长度上限') : null);
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
          UsageNote({ message }));
      }
      return h('div', { className: 'sbk-reply' },
        parsed.chapterTitle ? h('h3', { className: 'sbk-chapter' }, parsed.chapterTitle) : null,
        h('div', { className: 'sbk-copy' }, parsed.body || message.text),
        h(Hints, { hints: parsed.hints, onPick }),
        UsageNote({ message }));
    }

    /* ------------------------------------------------- 对话（故事）相关 */

    function pressProps(openMenu, items) {
      let timer = null;
      let suppressUntil = 0;
      const fire = (event) => {
        if (event?.stopPropagation) event.stopPropagation();
        suppressUntil = Date.now() + 900;
        openMenu(event, items);
      };
      const start = (event) => {
        if (event?.button && event.button !== 0) return;
        suppressUntil = 0;
        timer = setTimeout(() => { timer = null; fire(event); }, 480);
      };
      const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
      return {
        // 长按弹出的菜单会抢走随后的 click：这里在捕获阶段吞掉它，避免“长按=进入对话”
        onClickCapture: (event) => {
          if (Date.now() < suppressUntil) {
            if (event.preventDefault) event.preventDefault();
            if (event.stopPropagation) event.stopPropagation();
            suppressUntil = 0;
          }
        },
        onContextMenu: (event) => { event.preventDefault(); fire(event); },
        onTouchStart: start,
        onTouchEnd: cancel,
        onTouchMove: cancel,
        onTouchCancel: cancel,
        onMouseDown: start,
        onMouseUp: cancel,
        onMouseLeave: cancel,
      };
    }

    function conversationModeLabel(mode) {
      return mode === 'game' ? '游戏模式' : mode === 'story' ? '故事模式' : '未开始';
    }

    function formatTime(value) {
      if (!value) return '';
      const date = new Date(value);
      const diff = Date.now() - date.getTime();
      if (diff < 60_000) return '刚刚';
      if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
      if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
      return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    }

    function ConversationList({ book, busy, run, toast, onOpen, onCreate, openMenu, onRename, onDelete }) {
      const conversations = book.conversations || [];
      return h('div', { className: 'sbk-storylist' },
        h('div', { className: 'sbk-storylist-head' },
          h('div', null,
            h('h2', { className: 'sbk-storylist-title' }, '故事'),
            h('p', { className: 'sbk-hint' }, '每个对话拥有独立的消息、章节与时间线记忆；世界观、角色与手动填写的事件全对话共享。')),
          h('span', { className: 'sbk-spacer' }),
          h(Btn, { variant: 'primary', onClick: onCreate, disabled: busy }, '＋ 新建对话')),
        h('div', { className: 'sbk-convs' },
          conversations.map((conversation) => {
            const rounds = (conversation.messages || []).filter((item) => item.role === 'assistant').length;
            const last = [...(conversation.messages || [])].reverse().find((item) => item.role === 'assistant');
            return h('button', {
              key: conversation.id,
              type: 'button',
              className: 'sbk-conv',
              'data-active': conversation.id === book.activeConversationId,
              onClick: () => onOpen(conversation.id),
              ...pressProps(openMenu, [
                { label: `进入「${conversation.title}」`, onClick: () => onOpen(conversation.id) },
                { label: '重命名', onClick: () => onRename(conversation) },
                { label: '删除对话', danger: true, onClick: () => onDelete(conversation) },
              ]),
            },
            h('div', { className: 'sbk-conv-head' },
              h('span', { className: 'sbk-conv-title' }, conversation.title),
              h('span', { className: 'sbk-tag' }, conversationModeLabel(conversation.mode)),
              conversation.id === book.activeConversationId ? h('span', { className: 'sbk-tag sbk-tag--ai' }, '当前') : null),
            h('div', { className: 'sbk-conv-meta' },
              `${rounds} 轮 · ${formatTime(conversation.updatedAt || conversation.createdAt)}`),
            last ? h('div', { className: 'sbk-conv-preview' }, last.parsed?.chapterTitle || String(last.text || '').replace(/\s+/g, ' ').slice(0, 60)) : h('div', { className: 'sbk-conv-preview sbk-hint' }, '还没有内容，点进去开始'));
          })),
        conversations.length === 0
          ? h('div', { className: 'sbk-empty' }, h('b', null, '还没有对话'), h(Btn, { variant: 'primary', onClick: onCreate }, '＋ 新建对话'))
          : null);
    }

    function ModeStart({ book, conversation, busy, run, toast }) {
      const [mode, setMode] = useState('story');
      const [playerName, setPlayerName] = useState(conversation.player?.name || '');
      const [playerDesc, setPlayerDesc] = useState(conversation.player?.desc || '');
      const [styleHint, setStyleHint] = useState(book.settings.styleHint || '');

      const start = async () => {
        const result = await run('chat/start', {
          bookId: book.id, conversationId: conversation.id, mode, playerName, playerDesc, styleHint,
        }, '准备故事…');
        if (result) toast(mode === 'game' ? '游戏开始，祝你好运' : '故事开始');
      };

      const hasKnowledge = book.modules.basic.entries.length + book.modules.world.entries.length + book.modules.character.entries.length > 0;

      return h('div', { className: 'sbk-mode' },
        h('div', { className: 'sbk-mode-inner' },
          h('div', null,
            h('h2', { style: { margin: '0 0 6px', fontSize: 20, fontWeight: 600 } }, '选择游玩模式'),
            h('div', { className: 'sbk-hint' }, hasKnowledge ? `「${conversation.title}」会独立记录消息与时间线记忆。模式确定后即开始第一章。` : '这本故事书还没有知识库内容，可以先回各模块补充设定，也可以直接开始。')),
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

    function ChatHeader({ conversation, busy, onBack, onRename, onSettings, onMenu, onSwitch }) {
      return h('div', { className: 'sbk-chathead' },
        h('button', { type: 'button', className: 'sbk-iconbtn', onClick: onBack, title: '返回故事列表' }, '‹'),
        h('button', { type: 'button', className: 'sbk-chat-title', onClick: onRename, title: '点击重命名' },
          conversation.title,
          h('span', { className: 'sbk-chat-sub' }, conversationModeLabel(conversation.mode))),
        h('span', { className: 'sbk-spacer' }),
        h('button', { type: 'button', className: 'sbk-iconbtn', onClick: onSwitch, title: '切换 / 新建对话', disabled: busy }, '☰'),
        h(Btn, { size: 'sm', variant: 'ghost', onClick: onSettings, disabled: busy }, '⚙ 设置'));
    }

    function ChatPanel({ book, conversation, busy, run, toast, openModal, applyResponse, openMenu, onOpenConversation, onCreateConversation, onRenameConversation, onDeleteConversation, onRegenerate, onBranch }) {
      const [input, setInput] = useState('');
      const [streaming, setStreaming] = useState(null);
      const scrollRef = useRef(null);
      const messages = conversation.messages || [];
      const totalUsage = messages.reduce((acc, message) => {
        if (message.usage) {
          acc.in += Number(message.usage.inputTokens) || 0;
          acc.out += Number(message.usage.outputTokens) || 0;
        }
        return acc;
      }, { in: 0, out: 0 });

      useEffect(() => {
        const node = scrollRef.current;
        if (node) node.scrollTop = node.scrollHeight;
      }, [messages.length, streaming?.text]);

      const pickHint = (hint) => setInput(hint);

      const send = async (text) => {
        if (streaming || busy) return;
        const message = String(text ?? input).trim();
        if (!message) { toast('输入你的行动或方向', 'error'); return; }
        setInput('');
        setStreaming({ text: '' });
        try {
          await streamChat({ bookId: book.id, conversationId: conversation.id, message }, {
            onDelta: (chunk) => setStreaming((prev) => ({ text: (prev?.text || '') + chunk })),
            onDone: (data) => { setStreaming(null); applyResponse(data); if (data.memoryAdded > 0) toast(`+${data.memoryAdded} 条记忆已写入时间线`); },
            onError: (error) => { setStreaming(null); toast(error, 'error'); },
          });
        } catch (error) {
          setStreaming(null);
          toast(error?.message || String(error), 'error');
        }
      };

      const convMenuItems = (book.conversations || []).map((item) => ({
        label: `${item.title}${item.id === conversation.id ? '（当前）' : ''}`,
        onClick: () => onOpenConversation(item.id),
      }));
      convMenuItems.push({ label: '＋ 新建对话', onClick: onCreateConversation });
      convMenuItems.push({ label: '重命名当前对话', onClick: () => onRenameConversation(conversation) });
      convMenuItems.push({ label: '删除当前对话', danger: true, onClick: () => onDeleteConversation(conversation) });

      const chatMenuItems = [
        { label: '重新输入（重生成上一条）', onClick: () => onRegenerate(conversation), disabled: !messages.some((item) => item.role === 'assistant') },
        { label: '分支：从最后一条新建对话', onClick: () => onBranch(conversation, messages[messages.length - 1]?.id), disabled: messages.length === 0 },
        { label: '新建对话', onClick: onCreateConversation },
        { label: '删除当前对话', danger: true, onClick: () => onDeleteConversation(conversation) },
      ];

      if (!conversation.mode) return h(ModeStart, { book, conversation, busy, run, toast });

      return h('div', { className: 'sbk-chat' },
        h('div', { className: 'sbk-toolbar', ...pressProps(openMenu, chatMenuItems) },
          h('span', { className: 'sbk-tag', style: { color: 'var(--sbk-accent)' } }, conversation.mode === 'game' ? '🎲 游戏模式' : '📖 故事模式'),
          conversation.mode === 'game' && conversation.gameState?.time ? h('span', { className: 'sbk-chat-time sbk-notice' }, `游戏内时间：${conversation.gameState.time}`) : null,
          conversation.mode === 'story' ? h('span', { className: 'sbk-chat-time sbk-notice' }, `下一章：第 ${conversation.chapterIndex} 章`) : null,
          h('span', { className: 'sbk-spacer' }),
          h('span', { className: 'sbk-rounds sbk-notice' }, `${messages.filter((m) => m.role === 'assistant').length} 轮`),
          totalUsage.in || totalUsage.out
            ? h('span', { className: 'sbk-usage-total' }, `累计 ↑${fmtTokens(totalUsage.in)} · ↓${fmtTokens(totalUsage.out)}`)
            : null),
        h('div', {
          className: 'sbk-chat-scroll',
          ref: scrollRef,
          ...pressProps(openMenu, chatMenuItems),
        },
          messages.length === 0 && !streaming
            ? h('div', { className: 'sbk-empty' },
              h('div', { className: 'sbk-empty-glyph' }, conversation.mode === 'game' ? '🎲' : '📖'),
              h('b', null, conversation.mode === 'game' ? '输入你的第一个行动' : '写下故事的开端'),
              h('div', { className: 'sbk-hint', style: { maxWidth: 380 } },
                conversation.mode === 'game'
                  ? '例如「推开酒馆的门，环视四周」。GM 只会描写世界，不会替你做决定。'
                  : '例如「写一个雨夜里，陌生人在驿站认出了主角」。'),
              h('div', { className: 'sbk-hint' }, '长按或右键点击这里，可以重新输入、分支、新建或删除对话。'))
            : messages.map((message, index) => message.role === 'user'
              ? h('div', {
                key: message.id,
                className: 'sbk-msg sbk-msg--user',
                ...pressProps(openMenu, [
                  { label: '复制', onClick: () => copyText(message.text) },
                  { label: '从这里分支', onClick: () => onBranch(conversation, message.id) },
                ]),
              }, h('div', { className: 'sbk-bubble' }, message.text))
              : h('div', {
                key: message.id,
                className: 'sbk-msg',
                ...pressProps(openMenu, [
                  { label: '复制', onClick: () => copyText(message.text) },
                  { label: '从这里分支', onClick: () => onBranch(conversation, message.id) },
                  index === messages.length - 1 ? { label: '重新生成这一条', onClick: () => onRegenerate(conversation) } : null,
                ].filter(Boolean)),
              },
              h(Reply, { message, onPick: pickHint }))),
          streaming
            ? h('div', { className: 'sbk-msg' },
              h('div', { className: 'sbk-reply' },
                h('div', { className: 'sbk-copy' }, streaming.text || '…'),
                h('div', { className: 'sbk-usage' }, h('span', { className: 'sbk-pending' },
                  h('span', { className: 'sbk-dot' }), h('span', { className: 'sbk-dot' }), h('span', { className: 'sbk-dot' }),
                  h('span', null, '生成中…')))))
            : null),
        h('div', { className: 'sbk-composer' },
          h('div', { className: 'sbk-composer-inner' },
            h('div', { className: 'sbk-composer-row' },
              h('button', {
                type: 'button',
                className: 'sbk-convswitch',
                title: '切换对话',
                disabled: busy || Boolean(streaming),
                onClick: (event) => openMenu(event, convMenuItems),
              }, `💬 ${conversation.title}`, h('span', { className: 'sbk-convswitch-caret' }, '▾')),
              h('textarea', {
                value: input,
                placeholder: conversation.mode === 'game' ? '描述你的行动……（Ctrl/⌘ + Enter 发送）' : '写下剧情走向或角色行动……（Ctrl/⌘ + Enter 发送）',
                onChange: (event) => setInput(event.target.value),
                onKeyDown: (event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault();
                    send();
                  }
                },
                rows: 2,
              }),
              h(Btn, { variant: 'primary', className: 'sbk-send', onClick: () => send(), disabled: busy || Boolean(streaming) }, streaming ? '生成中' : '发送')),
            h('div', { className: 'sbk-inline' },
              h(Btn, { size: 'sm', variant: 'ghost', onClick: () => send(''), disabled: busy || Boolean(streaming) }, '继续（不输入）'),
              h('span', { className: 'sbk-notice' }, conversation.mode === 'game' ? '游戏模式会实时维护状态栏与记忆库' : '故事模式每章末尾给出 3-5 条后续发展提示')))));
    }

    function copyText(text) {
      try {
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {});
      } catch { /* 剪贴板不可用时静默 */ }
    }

    /* --------------------------------------------------------------- 页面 */

    function StorybookPage() {
      const [state, setState] = useState({ books: [], activeBookId: null });
      const [book, setBook] = useState(null);
      const [tab, setTab] = useState('basic');
      const [storyListMode, setStoryListMode] = useState(true);
      const [busy, setBusy] = useState('');
      const [toastState, setToastState] = useState(null);
      const [modal, setModal] = useState(null);
      const [menu, setMenu] = useState(null);
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

      const conversation = book
        ? (book.conversations || []).find((item) => item.id === book.activeConversationId) || (book.conversations || [])[0] || null
        : null;
      const inChat = tab === 'chat' && !storyListMode && Boolean(conversation);

      const openMenu = useCallback((event, items) => {
        const point = event?.changedTouches?.[0] || event?.touches?.[0] || event;
        setMenu({
          at: Date.now(),
          x: Math.max(8, Math.min(point?.clientX ?? 120, (window.innerWidth || 360) - 210)),
          y: Math.max(8, Math.min(point?.clientY ?? 120, (window.innerHeight || 640) - 60 - (items.length * 40))),
          items,
        });
      }, []);

      const selectBook = async (id) => {
        if (!id || id === book?.id) return;
        setBusy('切换故事书…');
        try {
          const data = await request('book/select', { id });
          applyResponse(data);
          setTab('basic');
          setStoryListMode(true);
        } catch (error) {
          toast(error?.message || String(error), 'error');
        } finally {
          setBusy('');
        }
      };

      const openConversation = async (id) => {
        if (!book) return;
        if (book.activeConversationId !== id) {
          const data = await run('conversation/select', { bookId: book.id, id }, '切换对话…');
          if (!data) return;
        }
        setStoryListMode(false);
      };

      const createConversation = async () => {
        if (!book) return;
        const data = await run('conversation/create', { bookId: book.id }, '新建对话…');
        if (data) {
          setStoryListMode(false);
          toast('已新建对话');
        }
      };

      const renameConversation = (target) => {
        setModal({
          kind: 'conv-rename',
          id: target.id,
          title: '重命名对话',
          description: '默认按「对话1、对话2」命名，可改成任何你记得住的名字。',
          value: target.title,
          confirmText: '保存',
        });
      };

      const deleteConversation = (target) => {
        setModal({
          kind: 'conv-delete',
          id: target.id,
          title: '删除对话',
          description: `将删除「${target.title}」的全部消息，以及这场对话中生成的时间线记忆；共享的世界观/角色与手动事件不受影响。`,
          confirmText: '删除',
          danger: true,
        });
      };

      const conversationSettings = (target) => {
        setModal({
          kind: 'conv-settings',
          id: target.id,
          title: '对话设置',
          temperature: target.settings?.temperature ?? 0.95,
          maxTokens: target.settings?.maxTokens ?? 8192,
          contextLength: target.settings?.contextLength ?? 8,
          confirmText: '保存',
        });
      };

      const regenerate = async (target) => {
        if (!target) return;
        const data = await run('chat/regenerate', { bookId: book.id, conversationId: target.id }, '正在重新生成…');
        if (data) toast(data.memoryAdded > 0 ? `已重新生成，+${data.memoryAdded} 条记忆` : '已重新生成');
      };

      const branchFrom = async (target, messageId) => {
        if (!target || !messageId) { toast('请选择一条消息再分支', 'error'); return; }
        const data = await run('chat/branch', { bookId: book.id, conversationId: target.id, messageId }, '正在创建分支…');
        if (data) {
          setStoryListMode(false);
          toast(`已从该消息分支（复制 ${data.copiedMemories || 0} 条记忆）`);
        }
      };

      const createBook = () => {
        setModal({ kind: 'create', title: '新建故事书', description: '每本故事书拥有彼此隔离的模块与知识库，互不引用。', value: '', placeholder: '例如：雾港旧事', confirmText: '创建' });
      };

      const deleteBook = () => {
        setModal({ kind: 'delete', title: '删除故事书', description: `将永久删除《${book?.title}》及其全部模块内容、对话记录与时间线，无法恢复。`, confirmText: '删除', danger: true });
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
          prompt: book?.settings?.promptBudget ?? 2400,
          confirmText: '保存',
        });
      };

      const confirmModal = async () => {
        if (!modal) return;
        const current = modal;
        setModal(null);
        if (current.kind === 'create') {
          const data = await run('book/create', { title: current.value, template: current.template !== false }, '创建中…');
          if (data) { setTab('basic'); toast('故事书已创建，可以先补充基础设定'); }
        } else if (current.kind === 'delete') {
          const data = await run('book/delete', { id: book.id }, '删除中…');
          if (data) { setBook(null); setTab('basic'); toast('故事书已删除'); }
        } else if (current.kind === 'settings') {
          if (current.value && current.value.trim() && current.value.trim() !== book.title) {
            await run('book/rename', { id: book.id, title: current.value.trim() }, '重命名…');
          }
          const data = await run('book/update', {
            bookId: book.id,
            patch: { settings: {
              styleHint: current.styleHint,
              autoMemory: current.autoMemory,
              knowledgeBudget: Number(current.budget) || 12000,
              residentBudget: Number(current.resident) || 2600,
              retrievalBudget: Number(current.retrieval) || 4200,
              promptBudget: Number(current.prompt) ?? 2400,
            } },
          }, '保存设置…');
          if (data) toast('设置已保存');
        } else if (current.kind === 'conv-rename') {
          const data = await run('conversation/rename', { bookId: book.id, id: current.id, title: current.value }, '重命名…');
          if (data) toast('对话已重命名');
        } else if (current.kind === 'conv-delete') {
          const data = await run('conversation/delete', { bookId: book.id, id: current.id }, '删除中…');
          if (data) {
            setStoryListMode(true);
            toast(`对话已删除${data.removedMemories ? `（同时清理 ${data.removedMemories} 条记忆）` : ''}`);
          }
        } else if (current.kind === 'conv-settings') {
          const data = await run('conversation/update', {
            bookId: book.id, id: current.id,
            settings: { temperature: Number(current.temperature), maxTokens: Number(current.maxTokens), contextLength: Number(current.contextLength) },
          }, '保存对话设置…');
          if (data) toast('对话设置已保存');
        }
      };

      const selectTab = (key) => {
        setTab(key);
        if (key === 'chat') setStoryListMode(true);
      };

      return h('div', { className: 'sbk-root' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        busy ? h('div', { className: 'sbk-busy' }) : null,
        inChat
          ? h('header', { className: 'sbk-head sbk-head--chat' },
            h(ChatHeader, {
              conversation,
              busy,
              onBack: () => setStoryListMode(true),
              onRename: () => renameConversation(conversation),
              onSettings: () => conversationSettings(conversation),
              onSwitch: (event) => openMenu(event, [
                ...(book.conversations || []).map((item) => ({
                  label: `${item.title}${item.id === conversation.id ? '（当前）' : ''}`,
                  onClick: () => openConversation(item.id),
                })),
                { label: '＋ 新建对话', onClick: createConversation },
                { label: '重命名当前对话', onClick: () => renameConversation(conversation) },
                { label: '删除当前对话', danger: true, onClick: () => deleteConversation(conversation) },
              ]),
            }))
          : h(Header, {
            state, book, tab, setTab: selectTab, busy,
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
                  '先创建一本故事书。之后可以在「基础设定 / 世界观 / 角色 / 时间线 / 制作」里积累知识，再进入「故事」开始对话。'),
                h(Btn, { variant: 'primary', onClick: createBook }, '＋ 创建故事书'))
              : tab === 'chat'
                ? (storyListMode || !conversation
                  ? h(ConversationList, {
                    book, busy, run, toast,
                    onOpen: openConversation,
                    onCreate: createConversation,
                    openMenu, onRename: renameConversation, onDelete: deleteConversation,
                  })
                  : h(ChatPanel, {
                    book, conversation, busy, run, toast, openModal: setModal, applyResponse, openMenu,
                    onOpenConversation: openConversation,
                    onCreateConversation: createConversation,
                    onRenameConversation: renameConversation,
                    onDeleteConversation: deleteConversation,
                    onRegenerate: regenerate,
                    onBranch: branchFrom,
                  }))
                : tab === 'craft'
                  ? h(CraftPanel, { book, busy, run, toast })
                  : h(ModulePanel, { book, module: tab, busy, run, toast, openModal: setModal, activeConversationId: conversation?.id || null })),
        menu
          ? h('div', {
            className: 'sbk-menu-mask',
            onMouseDown: (event) => {
              if (event.target === event.currentTarget && Date.now() - (menu.at || 0) > 260) setMenu(null);
            },
            onTouchStart: (event) => {
              if (event.target === event.currentTarget && Date.now() - (menu.at || 0) > 260) setMenu(null);
            },
            onContextMenu: (event) => { event.preventDefault(); setMenu(null); },
          }, h('div', {
            className: 'sbk-menu',
            style: { left: menu.x, top: menu.y },
            onMouseDown: (event) => event.stopPropagation(),
            onTouchStart: (event) => event.stopPropagation(),
          },
            menu.items.map((item) => h('button', {
              key: item.label,
              type: 'button',
              className: `sbk-menu-item${item.danger ? ' sbk-menu-item--danger' : ''}`,
              disabled: item.disabled,
              onClick: () => { setMenu(null); item.onClick(); },
            }, item.label))))
          : null,
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
          modal.kind === 'create' || modal.kind === 'conv-rename'
            ? h(Field, { label: modal.kind === 'create' ? '故事书名称' : '对话名称' },
              h('input', {
                className: 'sbk-input', autoFocus: true, value: modal.value,
                placeholder: modal.placeholder,
                onChange: (event) => setModal({ ...modal, value: event.target.value }),
              }))
            : modal.kind === 'conv-settings'
              ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
                h(Field, { label: '温度 temperature', hint: '越高越天马行空，0-2' },
                  h('input', {
                    className: 'sbk-input', type: 'number', min: 0, max: 2, step: 0.05, value: modal.temperature,
                    onChange: (event) => setModal({ ...modal, temperature: event.target.value }),
                  })),
                h(Field, { label: '单次输出上限 maxTokens', hint: '256-16384，含思考 token' },
                  h('input', {
                    className: 'sbk-input', type: 'number', min: 256, max: 16384, step: 256, value: modal.maxTokens,
                    onChange: (event) => setModal({ ...modal, maxTokens: event.target.value }),
                  })),
                h(Field, { label: '上下文长度（条消息）', hint: '每轮带给模型的历史消息条数，1-40' },
                  h('input', {
                    className: 'sbk-input', type: 'number', min: 1, max: 40, step: 1, value: modal.contextLength,
                    onChange: (event) => setModal({ ...modal, contextLength: event.target.value }),
                  })))
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
                  h(Field, { label: '提示词预算（字符）', hint: '基础设定作为系统提示词的注入上限' },
                    h('input', {
                      className: 'sbk-input', type: 'number', min: 0, max: 12000, step: 200, value: modal.prompt,
                      onChange: (event) => setModal({ ...modal, prompt: event.target.value }),
                    })),
                  h(Field, { label: '常驻预算（字符）', hint: '常驻块：标记常驻的条目 + 最近记忆' },
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
                    h('span', null, '对话后自动沉淀记忆到时间线（按对话隔离）')))
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
