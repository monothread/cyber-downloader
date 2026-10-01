import type { BinaryInfo } from '@shared/types';
import { useTranslator } from '../i18n/useTranslator';
import { useAppStore } from '../store/appStore';

function BinaryChip({ label, info }: { label: string; info: BinaryInfo | undefined }) {
    const t = useTranslator();
    if (!info) {
        return <span className="chip chip--pending">{label} …</span>;
    }
    if (!info.found) {
        return <span className="chip chip--bad" title={info.path}>
                {label} {t('binary.missing')}
            </span>;
    }
    return (
        <span className="chip chip--ok" title={`${info.path} (${info.source})`}>
            {label} {info.version ?? ''}
        </span>
    );
}

export function BinaryStatus() {
    const binaries = useAppStore((state) => {
        return state.binaries;
    });
    return (
        <div className="binary-status">
            <BinaryChip label="yt-dlp" info={binaries?.ytdlp} />
            <BinaryChip label="ffmpeg" info={binaries?.ffmpeg} />
        </div>
    );
}
