import { randomUUID } from 'node:crypto';
import { BrowserWindow, session, type Session } from 'electron';
import type { StreamKind } from '@shared/types';
import { hostOf, isPrivateHost } from './mediaKinds';
import { STREAM_USER_AGENT } from './pageScanner';
import { classifyRequest, classifyResponse } from './sniffRules';

export const DEFAULT_SNIFF_TIMEOUT_MS = 25000;
export const SETTLE_AFTER_FIRST_STREAM_MS = 4000;
const PLAY_ATTEMPT_DELAYS_MS = [1500, 4000, 8000, 13000];
const VIEWPORT = { width: 1280, height: 720 };

export interface SniffedStream {
    url: string;
    kind: StreamKind;
    referer: string;
    cookie: string | null;
}

export interface SniffResult {
    streams: SniffedStream[];
    title: string | null;
    error: string | null;
}

// Runs inside the page: starts every <video> (muted, so autoplay rules allow it) and presses the usual play buttons.
const PLAY_SCRIPT = `(() => {
  document.querySelectorAll('video').forEach((video) => { video.muted = true; const started = video.play(); if (started && started.catch) { started.catch(() => {}); } });
  ['.vjs-big-play-button', '.jw-icon-display', '.plyr__control--overlaid', '.ytp-large-play-button', 'button[aria-label*="play" i]', '[class*="big-play" i]', '[class*="play-btn" i]', '[class*="play_button" i]']
    .forEach((selector) => document.querySelectorAll(selector).forEach((element) => { try { element.click(); } catch (e) {} }));
})();`;

function timeoutFromEnvironment(): number {
    const value = Number(process.env.CYBER_DL_SNIFF_TIMEOUT_MS);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_SNIFF_TIMEOUT_MS;
}

async function cookieHeaderFor(ses: Session, url: string): Promise<string | null> {
    const cookies = await ses.cookies.get({ url });
    return cookies.length > 0
        ? cookies
              .map((cookie) => {
                  return `${cookie.name}=${cookie.value}`;
              })
              .join('; ')
        : null;
}

function lockDownSession(ses: Session): void {
    ses.setPermissionRequestHandler((_contents, _permission, callback) => {
        callback(false);
    });
    ses.setPermissionCheckHandler(() => {
        return false;
    });
    ses.on('will-download', (event) => {
        event.preventDefault();
    });
}

// Loads the page in a hidden, sandboxed window (throwaway in-memory session, no Node, no popups, no navigation
// away from the page) and records the media addresses the page asks for.
export async function sniffStreams(pageUrl: string, signal: AbortSignal): Promise<SniffResult> {
    if (signal.aborted) {
        return { streams: [], title: null, error: null };
    }
    const ses = session.fromPartition(`sniff-${randomUUID()}`);
    lockDownSession(ses);
    ses.setUserAgent(STREAM_USER_AGENT);
    const window = new BrowserWindow({
        show: false,
        ...VIEWPORT,
        webPreferences: {
            session: ses,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            autoplayPolicy: 'no-user-gesture-required',
            backgroundThrottling: false
        }
    });
    const found = new Map<string, { kind: StreamKind; referer: string }>();
    const rootHost = hostOf(pageUrl);
    let pageLoaded = false;
    let lastFoundAt = 0;

    const record = (url: string, kind: StreamKind, referer: string | undefined): void => {
        if ((isPrivateHost(hostOf(url)) && !isPrivateHost(rootHost)) || found.has(url)) {
            return;
        }
        found.set(url, { kind, referer: referer && referer.length > 0 ? referer : pageUrl });
        lastFoundAt = Date.now();
    };

    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
        const decision = classifyRequest(details.url, details.resourceType);
        if (decision.kind !== null) {
            record(details.url, decision.kind, details.referrer);
        }
        callback({ cancel: decision.cancel });
    });
    ses.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
        const contentType = details.responseHeaders?.['content-type']?.[0] ?? details.responseHeaders?.['Content-Type']?.[0];
        const lengthHeader = details.responseHeaders?.['content-length']?.[0] ?? details.responseHeaders?.['Content-Length']?.[0];
        const decision = classifyResponse(details.url, contentType, lengthHeader ? Number(lengthHeader) : null);
        if (decision.kind !== null) {
            record(details.url, decision.kind, details.referrer);
        }
        callback({ cancel: decision.cancel });
    });

    const contents = window.webContents;
    contents.setAudioMuted(true);
    contents.setWindowOpenHandler(() => {
        return { action: 'deny' };
    });
    // After the page has loaded, clicking an overlay or an ad must not take the window somewhere else.
    contents.on('will-navigate', (event) => {
        if (pageLoaded) {
            event.preventDefault();
        }
    });

    const clickCenter = (): void => {
        const point = { x: Math.round(VIEWPORT.width / 2), y: Math.round(VIEWPORT.height / 2) };
        contents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
        contents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
    };
    const tryToPlay = (): void => {
        if (!window.isDestroyed()) {
            void contents.executeJavaScript(PLAY_SCRIPT, true).catch(() => {
                return undefined;
            });
            clickCenter();
        }
    };

    let loadError: string | null = null;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const finished = new Promise<void>((resolve) => {
        const finish = (): void => {
            resolve();
        };
        contents.once('did-finish-load', () => {
            pageLoaded = true;
            PLAY_ATTEMPT_DELAYS_MS.forEach((delay) => {
                timers.push(setTimeout(tryToPlay, delay));
            });
        });
        contents.once('did-fail-load', (_event, _code, description, _url, isMainFrame) => {
            if (isMainFrame) {
                loadError = `The page could not be loaded (${description}).`;
                finish();
            }
        });
        timers.push(setTimeout(finish, timeoutFromEnvironment()));
        const settle = setInterval(() => {
            if (found.size > 0 && Date.now() - lastFoundAt >= SETTLE_AFTER_FIRST_STREAM_MS) {
                finish();
            }
        }, 500);
        timers.push(settle as unknown as ReturnType<typeof setTimeout>);
        signal.addEventListener('abort', finish, { once: true });
    });

    void window.loadURL(pageUrl, { userAgent: STREAM_USER_AGENT }).catch(() => {
        return undefined;
    });
    await finished;

    timers.forEach((timer) => {
        clearTimeout(timer);
        clearInterval(timer);
    });
    const title = window.isDestroyed() ? null : contents.getTitle() || null;
    const streams = await Promise.all(
        Array.from(found.entries(), async ([url, info]) => {
            return { url, kind: info.kind, referer: info.referer, cookie: await cookieHeaderFor(ses, url) };
        })
    );
    if (!window.isDestroyed()) {
        window.destroy();
    }
    await ses.clearStorageData().catch(() => {
        return undefined;
    });
    return { streams, title, error: streams.length === 0 ? loadError : null };
}
