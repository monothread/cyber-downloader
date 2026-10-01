import type { BinaryInfo } from '@shared/types';
import { useTranslator } from '../i18n/useTranslator';
import { useAnimeStore } from '../store/animeStore';
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
    // ani-cli only exists where the anime section does.
    const aniCli = useAnimeStore((state) => {
        return state.status.aniCli;
    });
    return (
        <div className="binary-status">
            <BinaryChip label="yt-dlp" info={binaries?.ytdlp} />
            <BinaryChip label="ffmpeg" info={binaries?.ffmpeg} />
            {aniCli && <BinaryChip label="ani-cli" info={aniCli} />}
        </div>
    );
}
