import { useEffect, useMemo } from 'react';
import type { AnimeScheduleEntry } from '@shared/anime';
import type { Translator } from '@shared/i18n';
import { selectableTimeZones } from '@shared/timezone';
import { useAppLanguage, useTranslator } from '../i18n/useTranslator';
import { useAnimeStore, type AnimeScheduleView } from '../store/animeStore';
import { AnimeCover } from './AnimeCover';
import { animeErrorKey } from './animeText';
import { SelectField } from './fields';
import { RowLink } from './RowLink';

const VIEWS: readonly AnimeScheduleView[] = ['day', 'week'];

function viewLabel(view: AnimeScheduleView, t: Translator): string {
    return view === 'week' ? t('anime.schedule.view.week') : t('anime.schedule.view.day');
}

function dayHeading(startOfDay: number, timeZone: string, language: string): string {
    return new Intl.DateTimeFormat(language, { timeZone, weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(startOfDay * 1000));
}

function airingTime(entry: AnimeScheduleEntry, timeZone: string, language: string): string {
    return new Date(entry.airingAt * 1000).toLocaleTimeString(language, { timeZone, hour: '2-digit', minute: '2-digit' });
}

// The episodes that air today or this week, one section for each day of the time zone that is set, in the order they air. Clicking one
// goes to the search, which looks the anime up by its names.
export function AnimeSchedule() {
    const t = useTranslator();
    const language = useAppLanguage();
    const schedule = useAnimeStore((state) => {
        return state.schedule;
    });
    const loadSchedule = useAnimeStore((state) => {
        return state.loadSchedule;
    });
    const setView = useAnimeStore((state) => {
        return state.setScheduleView;
    });
    const setTimeZone = useAnimeStore((state) => {
        return state.setScheduleTimeZone;
    });
    const openEntry = useAnimeStore((state) => {
        return state.openScheduleEntry;
    });
    const { view, timeZone, limits, entries, status } = schedule;
    const timeZones = useMemo(() => {
        return selectableTimeZones(timeZone);
    }, [timeZone]);

    useEffect(() => {
        void loadSchedule(false);
    }, [loadSchedule, view, timeZone]);

    const loading = status === 'loading';
    const days = limits.slice(0, -1).map((start, position) => {
        const end = limits[position + 1] as number;
        return {
            start,
            entries: entries.filter((entry) => {
                return entry.airingAt >= start && entry.airingAt < end;
            })
        };
    });

    return (
        <section className="history" aria-label={t('anime.schedule.aria')}>
            <div className="field-row">
                <SelectField label={t('anime.schedule.view.label')} value={view} options={VIEWS} formatOption={(option) => {
                    return viewLabel(option, t);
                }} onChange={setView} />
                <SelectField
                    label={t('anime.schedule.timezone.label')}
                    value={timeZone}
                    options={timeZones}
                    formatOption={(zone) => {
                        return zone.replaceAll('_', ' ');
                    }}
                    onChange={setTimeZone}
                />
                <button
                    type="button"
                    className="btn"
                    disabled={loading}
                    onClick={() => {
                        void loadSchedule(true);
                    }}
                >
                    {t('anime.schedule.refresh')}
                </button>
            </div>
            <div className="queue__toolbar">
                <span className="section-label">{t('anime.schedule.count', { count: entries.length })}</span>
            </div>
            {status === 'error' && schedule.error && (
                <p className="field__warning" role="alert" title={schedule.error.raw}>
                    {t(animeErrorKey(schedule.error.code))}
                </p>
            )}
            {loading && entries.length === 0 && <p className="empty">{t('anime.schedule.loading')}</p>}
            {status === 'ready' && entries.length === 0 && <p className="empty">{t('anime.schedule.empty')}</p>}
            {entries.length > 0 &&
                days.map((day, position) => {
                    const heading = dayHeading(day.start, timeZone, language);
                    return (
                        <section key={day.start} className="schedule__day" aria-label={heading}>
                            <h3 className={position === 0 ? 'section-label schedule__today' : 'section-label'}>
                                {position === 0 ? `${heading} · ${t('anime.schedule.today')}` : heading}
                            </h3>
                            {day.entries.length === 0 && <p className="field__hint">{t('anime.schedule.emptyDay')}</p>}
                            <ul className="cover-grid">
                                {day.entries.map((entry) => {
                                    return (
                                        <li key={`${entry.anilistId}-${entry.episode}`} className="history__item cover-card cover-card--bottom-meta row--link">
                                            <AnimeCover title={entry.title} url={entry.coverUrl} />
                                            <div className="history__main">
                                                <span className="history__title">
                                                    <RowLink
                                                        label={t('anime.schedule.open', { title: entry.title, episode: entry.episode })}
                                                        title={entry.title}
                                                        onClick={() => {
                                                            void openEntry(entry);
                                                        }}
                                                    >
                                                        {entry.title}
                                                    </RowLink>
                                                </span>
                                                <span className="history__meta">
                                                    {t('anime.schedule.episode', { episode: entry.episode })} · {airingTime(entry, timeZone, language)}
                                                </span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    );
                })}
        </section>
    );
}
