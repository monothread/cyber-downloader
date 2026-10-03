import { useEffect, useState, type RefObject } from 'react';
import {
    applySubtitleChoice,
    readSubtitleBackground,
    readSubtitleColor,
    saveSubtitleBackground,
    saveSubtitleColor,
    SUBTITLE_BACKGROUND_VARIABLE,
    SUBTITLE_BACKGROUNDS,
    SUBTITLE_COLOR_VARIABLE,
    SUBTITLE_COLORS,
    type SubtitleBackgroundId,
    type SubtitleTextColorId
} from '../components/subtitleColor';
import { readSubtitleScale, saveSubtitleScale, stepSubtitleScale } from '../components/subtitleScale';

export interface SubtitleStyle {
    scale: number;
    color: SubtitleTextColorId;
    background: SubtitleBackgroundId;
    // One step bigger (1) or smaller (-1).
    resize: (direction: 1 | -1) => void;
    changeColor: (id: SubtitleTextColorId) => void;
    changeBackground: (id: SubtitleBackgroundId) => void;
}

// How the subtitles look: what the viewer chose is remembered for every episode and shown through variables on the video,
// which the style of the subtitles reads (see .player__video::cue).
export function useSubtitleStyle(video: RefObject<HTMLVideoElement | null>): SubtitleStyle {
    const [scale, setScale] = useState(readSubtitleScale);
    const [color, setColor] = useState(readSubtitleColor);
    const [background, setBackground] = useState(readSubtitleBackground);

    useEffect(() => {
        video.current?.style.setProperty('--subtitle-scale', String(scale));
    }, [video, scale]);

    // A choice that leaves the theme in charge clears its variable.
    useEffect(() => {
        const element = video.current;
        if (element) {
            applySubtitleChoice(element, SUBTITLE_COLOR_VARIABLE, SUBTITLE_COLORS, color);
            applySubtitleChoice(element, SUBTITLE_BACKGROUND_VARIABLE, SUBTITLE_BACKGROUNDS, background);
        }
    }, [video, color, background]);

    function resize(direction: 1 | -1): void {
        const next = stepSubtitleScale(scale, direction);
        setScale(next);
        saveSubtitleScale(next);
    }

    function changeColor(id: SubtitleTextColorId): void {
        setColor(id);
        saveSubtitleColor(id);
    }

    function changeBackground(id: SubtitleBackgroundId): void {
        setBackground(id);
        saveSubtitleBackground(id);
    }

    return { scale, color, background, resize, changeColor, changeBackground };
}
