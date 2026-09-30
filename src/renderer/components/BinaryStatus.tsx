import type { BinaryInfo } from '@shared/types';
import { useAppStore } from '../store/appStore';

function BinaryChip({ label, info }: { label: string; info: BinaryInfo | undefined }) {
    if (!info) {
        return <span className="chip chip--pending">{label} …</span>;
    }
    if (!info.found) {
        return <span className="chip chip--bad" title={info.path}>
                {label} MISSING
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
    const updating = useAppStore((state) => {
        return state.updating;
    });
    const updateYtdlp = useAppStore((state) => {
        return state.updateYtdlp;
    });
    return (
        <div className="binary-status">
            <BinaryChip label="yt-dlp" info={binaries?.ytdlp} />
            <BinaryChip label="ffmpeg" info={binaries?.ffmpeg} />
            <button
                type="button"
                className="btn btn--small"
                disabled={updating}
                onClick={() => {
                    void updateYtdlp();
                }}
            >
                {updating ? 'UPDATING…' : 'UPDATE YT-DLP'}
            </button>
        </div>
    );
}
