import { useTranslator } from '../i18n/useTranslator';
import { useAppStore } from '../store/appStore';
import { UpdateActions } from './UpdateActions';
import { updateSummary } from './updateText';

const VISIBLE_STATUSES = ['available', 'downloading', 'downloaded'];

export function UpdateBanner() {
    const t = useTranslator();
    const appUpdate = useAppStore((state) => {
        return state.appUpdate;
    });
    if (!VISIBLE_STATUSES.includes(appUpdate.status)) {
        return null;
    }
    return (
        <div className="update-banner" role="status">
            <span className="update-banner__text">{updateSummary(appUpdate, t)}</span>
            <UpdateActions />
        </div>
    );
}
