// ==UserScript==
// @name         DeepSeek Rescue Backup
// @namespace    https://github.com/<ТВОЙ_НИК>/deepseek-rescue-backup
// @version      0.5.0
// @description  Экспорт и продолжение чатов DeepSeek (JSON + Markdown)
// @author       Wronskian
// @match        https://chat.deepseek.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Netrivial/deepseek-rescue-backup/main/deepseek-rescue-backup.user.js
// @downloadURL  https://raw.githubusercontent.com/Netrivial/deepseek-rescue-backup/main/deepseek-rescue-backup.user.js
// @homepageURL  https://github.com/Netrivial/deepseek-rescue-backup
// @supportURL   https://github.com/Netrivial/deepseek-rescue-backup/issues
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    // CONFIG
    // ============================================================
    const USE_FRONTMATTER = true;
    const BACKUP_SHORTCUT = { ctrlKey: true, shiftKey: true, altKey: false, code: 'KeyE' };
    const STORAGE_COLLAPSED = 'dsrb.ui.collapsed';

    // ============================================================
    // 1. Styles
    // ============================================================
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        .dsrb-btn {
            min-width: 110px; padding: 10px 16px;
            background: #4a6cf7; color: white;
            border: none; border-radius: 8px; cursor: pointer;
            font-family: sans-serif; font-size: 14px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            pointer-events: auto;
            transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
        }
        .dsrb-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,0,0,0.35); background: #5677f8; }
        .dsrb-btn:active { transform: translateY(0) scale(0.97); }
        .dsrb-btn:disabled { opacity: 0.7; cursor: default; transform: none; }
        .dsrb-toggle {
            width: 48px; height: 48px; padding: 0;
            border: none; border-radius: 50%;
            background: #4a6cf7; color: white;
            font-size: 22px; line-height: 1; cursor: pointer;
            pointer-events: auto;
            box-shadow: 0 4px 12px rgba(74,108,247,0.45);
            transition: transform 200ms ease, box-shadow 200ms ease, background 200ms ease;
        }
        .dsrb-toggle:hover { transform: scale(1.06); background: #5677f8; box-shadow: 0 6px 16px rgba(74,108,247,0.55); }
        .dsrb-toggle:active { transform: scale(0.95); }
        @media (prefers-reduced-motion: reduce) {
            .dsrb-btn, .dsrb-toggle { transition: none !important; }
        }
    `;
    document.head.appendChild(styleEl);

    // ============================================================
    // 2. UI
    // ============================================================
    const panel = document.createElement('div');
    panel.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
        display: flex; flex-direction: column; gap: 10px;
        align-items: flex-end; pointer-events: none;
        isolation: isolate;
    `;
    document.body.appendChild(panel);

    const actions = document.createElement('div');
    actions.style.cssText = `
        display: flex; flex-direction: column; gap: 8px;
        align-items: flex-end; pointer-events: none;
        transition: opacity 180ms ease, transform 180ms ease, visibility 0s;
    `;
    panel.appendChild(actions);

    const btnBackup   = makeButton(' Backup',   'Скачать JSON + Markdown (Ctrl+Shift+E)');
    const btnCopyMd   = makeButton(' Copy MD',  'Скопировать Markdown в буфер');
    const btnContinue = makeButton(' Continue', 'Продолжить из JSON-бэкапа');
    actions.append(btnBackup, btnCopyMd, btnContinue);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'dsrb-toggle';
    toggle.title = 'DeepSeek Backup — свернуть/развернуть';
    toggle.textContent = '+';
    panel.appendChild(toggle);

    function makeButton(text, tooltip) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'dsrb-btn';
        b.textContent = text;
        b.title = tooltip;
        return b;
    }

    function flashButton(btn, tempText) {
        const original = btn.textContent;
        btn.textContent = tempText;
        btn.disabled = true;
        setTimeout(() => {
            btn.textContent = original;
            btn.disabled = false;
        }, 1500);
    }

    function setCollapsed(collapsed) {
        localStorage.setItem(STORAGE_COLLAPSED, String(collapsed));
        if (collapsed) {
            actions.style.opacity = '0';
            actions.style.transform = 'translateY(8px) scale(0.96)';
            actions.style.visibility = 'hidden';
            actions.style.transition = 'opacity 180ms ease, transform 180ms ease, visibility 0s 180ms';
            toggle.textContent = '+';
        } else {
            actions.style.opacity = '1';
            actions.style.transform = 'translateY(0) scale(1)';
            actions.style.visibility = 'visible';
            actions.style.transition = 'opacity 180ms ease, transform 180ms ease, visibility 0s';
            toggle.textContent = '−';
        }
    }

    setCollapsed(localStorage.getItem(STORAGE_COLLAPSED) === 'true');
    toggle.addEventListener('click', () => {
        const isCollapsed = localStorage.getItem(STORAGE_COLLAPSED) === 'true';
        setCollapsed(!isCollapsed);
    });

    // ============================================================
    // 3. Handlers
    // ============================================================
    async function doBackup() {
        try {
            const data = await grabCurrentChat();
            downloadJSON(data);
            downloadMarkdown(data);
            flashButton(btnBackup, 'Saved ✓');
        } catch (e) {
            console.error(e);
            alert('Ошибка: ' + e.message);
        }
    }

    async function doCopyMarkdown() {
        try {
            const data = await grabCurrentChat();
            const ok = await copyToClipboard(buildMarkdown(data));
            flashButton(btnCopyMd, ok ? 'Copied ✓' : 'Fail ✗');
            if (!ok) alert('Не удалось скопировать в буфер.');
        } catch (e) {
            console.error(e);
            alert('Ошибка: ' + e.message);
        }
    }

    function doContinue() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            try {
                const data = JSON.parse(await file.text());
                if (!Array.isArray(data.messages)) {
                    throw new Error('В файле нет массива messages — это точно наш бэкап?');
                }
                const prompt = formatForContinuation(data);
                const inserted = tryInsertIntoComposer(prompt);
                if (inserted) {
                    alert(`Вставлено ${data.messages.length} сообщений в поле ввода. Проверь и отправь.`);
                } else if (await copyToClipboard(prompt)) {
                    alert('Поле ввода не найдено. Контекст скопирован в буфер — вставь вручную (Ctrl+V).');
                } else {
                    console.log('[Continue] Prompt:', prompt);
                    alert('Не удалось вставить или скопировать. Текст — в консоли (F12).');
                }
            } catch (e) {
                console.error('[Continue]', e);
                alert('Ошибка: ' + e.message);
            }
        };
        input.click();
    }

    btnBackup.addEventListener('click', doBackup);
    btnCopyMd.addEventListener('click', doCopyMarkdown);
    btnContinue.addEventListener('click', doContinue);

    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey === BACKUP_SHORTCUT.ctrlKey &&
            e.shiftKey === BACKUP_SHORTCUT.shiftKey &&
            e.altKey === BACKUP_SHORTCUT.altKey &&
            e.code === BACKUP_SHORTCUT.code) {
            e.preventDefault();
            doBackup();
        }
    });

    // ============================================================
    // 4. API
    // ============================================================
    async function grabCurrentChat() {
        const m = location.pathname.match(/\/a\/chat\/s\/([a-f0-9-]+)/i);
        if (!m) throw new Error('Открой конкретный чат, а не главную страницу DeepSeek.');
        const chatId = m[1];

        let token = null;
        try {
            const raw = localStorage.getItem('userToken');
            if (raw) token = JSON.parse(raw).value || null;
        } catch (e) {}

        if (!token) throw new Error('Не найден userToken в localStorage. Ты точно залогинен?');

        const resp = await fetch(`/api/v0/chat/history_messages?chat_session_id=${chatId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
            credentials: 'include',
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        console.log('[Backup] RAW API response:', json);

        const biz = json?.data?.biz_data;
        if (!biz) throw new Error('Нет data.biz_data в ответе');

        const session = biz.chat_session || {};
        const allMsgs = biz.chat_messages || [];

        const byId = new Map(allMsgs.map(m => [m.message_id, m]));
        const branch = [];
        let cur = session.current_message_id;
        while (cur != null && byId.has(cur)) {
            const msg = byId.get(cur);
            branch.push(msg);
            cur = msg.parent_id;
        }
        branch.reverse();

        const pick = (frags, type) =>
            frags.filter(f => f.type === type).map(f => f.content).filter(Boolean).join('\n\n');

        const messages = branch.map(msg => {
            const frags = msg.fragments || [];
            const isUser = (msg.role || '').toLowerCase() === 'user';
            const content = isUser ? pick(frags, 'REQUEST') : pick(frags, 'RESPONSE');
            const thinking = isUser ? '' : pick(frags, 'THINK');
            return {
                role: isUser ? 'user' : 'assistant',
                content,
                thinking: thinking || undefined,
                timestamp: msg.inserted_at ? new Date(msg.inserted_at * 1000).toISOString() : undefined,
            };
        }).filter(m => m.content || m.thinking);

        return {
            id: chatId,
            url: location.href,
            title: (session.title || document.title.replace(/\s*-\s*DeepSeek.*$/, '')).trim() || 'Без названия',
            exported_at: new Date().toISOString(),
            session: {
                model_type: session.model_type,
                created_at: session.inserted_at ? new Date(session.inserted_at * 1000).toISOString() : undefined,
                updated_at: session.updated_at ? new Date(session.updated_at * 1000).toISOString() : undefined,
            },
            messages,
        };
    }

    // ============================================================
    // 5. Renderers
    // ============================================================
    function buildMarkdown(data) {
        const lines = [];
        if (USE_FRONTMATTER) {
            lines.push('---');
            lines.push(`title: ${JSON.stringify(data.title)}`);
            lines.push(`exported_at: ${data.exported_at}`);
            if (data.session?.model_type) lines.push(`model: ${data.session.model_type}`);
            if (data.session?.created_at) lines.push(`created_at: ${data.session.created_at}`);
            if (data.session?.updated_at) lines.push(`updated_at: ${data.session.updated_at}`);
            lines.push(`messages: ${data.messages.length}`);
            lines.push(`source: ${data.url}`);
            lines.push('---');
            lines.push('');
        }
        lines.push(`# ${data.title}`);
        lines.push('');
        if (!USE_FRONTMATTER) {
            lines.push(`> Экспортировано: ${data.exported_at}`);
            if (data.session?.model_type) lines.push(`> Модель: ${data.session.model_type}`);
            lines.push('');
        }
        if (!data.messages.length) {
            lines.push('_Сообщений нет._');
            lines.push('');
            return lines.join('\n');
        }
        for (const msg of data.messages) {
            const role = msg.role === 'user' ? '**User**' : '**DeepSeek**';
            lines.push(`### ${role}`);
            lines.push('');
            if (msg.thinking) {
                lines.push(`<details><summary>Thinking</summary>`);
                lines.push('');
                lines.push(msg.thinking);
                lines.push('');
                lines.push('</details>');
                lines.push('');
            }
            lines.push(msg.content);
            lines.push('');
            lines.push('---');
            lines.push('');
        }
        return lines.join('\n');
    }

    function downloadJSON(data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = makeFilename(data.title, 'json');
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function downloadMarkdown(data) {
        const blob = new Blob([buildMarkdown(data)], { type: 'text/markdown' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = makeFilename(data.title, 'md');
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function makeFilename(title, ext) {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        const date = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
        const time = `${pad(d.getHours())}-${pad(d.getMinutes())}`;
        return `deepseek_${date}_${time}_${sanitize(title)}.${ext}`;
    }

    // ============================================================
    // 6. Continuation
    // ============================================================
    function formatForContinuation(data) {
        const lines = [];
        lines.push(`Бэкап чата «${data.title || 'без названия'}».`);
        lines.push('');
        lines.push('Бэкап:');
        lines.push('');
        for (const msg of data.messages) {
            const label = msg.role === 'user' ? 'User' : 'Assistant';
            lines.push(`${label}:`);
            lines.push(msg.content);
            lines.push('');
        }
        lines.push('---');
        lines.push('');
        lines.push('Пожалуйста, продолжи диалог от лица Assistant. История выше — это контекст, опирайся на неё.');
        lines.push('Роль — наставник/учитель/партнёр (подходящая по ситуации). Если что-то в контексте непонятно — спрашивай, не стесняйся.');
        return lines.join('\n');
    }

    function tryInsertIntoComposer(text) {
        const textareas = [...document.querySelectorAll('textarea')]
            .filter(t => t.offsetParent !== null && !t.disabled && !t.readOnly);
        if (textareas.length) {
            const el = textareas[textareas.length - 1];
            setReactTextareaValue(el, text);
            el.focus();
            return true;
        }
        const editables = [...document.querySelectorAll('[contenteditable="true"]')]
            .filter(t => t.offsetParent !== null);
        if (editables.length) {
            const el = editables[editables.length - 1];
            el.focus();
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand('insertText', false, text);
            return true;
        }
        return false;
    }

    // ============================================================
    // 7. Utils
    // ============================================================
    function setReactTextareaValue(el, value) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
        )?.set;
        if (nativeSetter) nativeSetter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (e2) {}
            document.body.removeChild(ta);
            return ok;
        }
    }

    function sanitize(name) {
        return name.replace(/[^a-zа-яё0-9]/gi, '_').slice(0, 50);
    }
})();
