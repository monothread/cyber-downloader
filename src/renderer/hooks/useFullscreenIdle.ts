import { useEffect, useState, type RefObject } from 'react';

// How long the mouse can stay still in fullscreen before the controls go away.
export const CONTROLS_IDLE_MS = 3000;

// Tells whether the controls of the player should be hidden: in fullscreen, after the mouse has stood still for a while.
// The stage is the element that goes to fullscreen (the parent of the video).
export function useFullscreenIdle(video: RefObject<HTMLVideoElement | null>): boolean {
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        const stage = video.current?.parentElement;
        if (!stage) {
            return undefined;
        }
        let timer: ReturnType<typeof setTimeout> | null = null;
        const clearTimer = (): void => {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
        };
        const onMouseMove = (): void => {
            clearTimer();
            setHidden(false);
            timer = setTimeout(() => {
                timer = null;
                setHidden(true);
            }, CONTROLS_IDLE_MS);
        };
        const onFullscreenChange = (): void => {
            if (document.fullscreenElement === stage) {
                stage.addEventListener('mousemove', onMouseMove);
                onMouseMove();
            } else {
                stage.removeEventListener('mousemove', onMouseMove);
                clearTimer();
                setHidden(false);
            }
        };
        document.addEventListener('fullscreenchange', onFullscreenChange);
        onFullscreenChange();
        return () => {
            document.removeEventListener('fullscreenchange', onFullscreenChange);
            stage.removeEventListener('mousemove', onMouseMove);
            clearTimer();
        };
    }, [video]);

    return hidden;
}
