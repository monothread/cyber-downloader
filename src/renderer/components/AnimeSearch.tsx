import { ANIME_AUDIOS, type AnimeAudio } from '@shared/anime';
import type { Translator } from '@shared/i18n';
import { useTranslator } from '../i18n/useTranslator';
import { useAppStore } from '../store/appStore';
import { effectiveAudio, useAnimeStore } from '../store/animeStore';
import { animeErrorKey } from './animeText';
import { AnimeDetail } from './AnimeDetail';
import { SelectField, TextField } from './fields';

function audioLabel(audio: AnimeAudio, t: Translator): string {
    return audio === 'dub' ? t('anime.audio.dub') : t('anime.audio.sub');
}

export function AnimeSearch() {
    const t = useTranslator();
    const search = useAnimeStore((state) => {
        return state.search;
    });
    const selection = useAnimeStore((state) => {
        return state.selection;
    });
    const setQuery = useAnimeStore((state) => {
        return state.setQuery;
    });
    const setAudio = useAnimeStore((state) => {
        return state.setAudio;
    });
    const runSearch = useAnimeStore((state) => {
        return state.runSearch;
    });
    const openResult = useAnimeStore((state) => {
        return state.openResult;
    });
    const settingsAudio = useAppStore((state) => {
        return state.settings.animeAudio;
    });

    if (selection) {
        return <AnimeDetail />;
    }
    const searching = search.status === 'searching';

    return (
        <section className="anime__search" aria-label={t('anime.search.aria')}>
            <form
                className="field-row"
                onSubmit={(event) => {
                    event.preventDefault();
                    void runSearch();
                }}
            >
                <TextField label={t('anime.search.label')} value={search.query} placeholder={t('anime.search.placeholder')} onChange={setQuery} />
                <SelectField
                    label={t('anime.audio.label')}
                    value={effectiveAudio(search, settingsAudio)}
                    options={ANIME_AUDIOS}
                    formatOption={(audio) => {
                        return audioLabel(audio, t);
                    }}
                    onChange={setAudio}
                />
                <button type="submit" className="btn btn--primary" disabled={searching || search.query.trim().length === 0}>
                    {searching ? t('anime.search.searching') : t('anime.search.button')}
                </button>
            </form>
            {search.status === 'error' && search.error && (
                <p className="field__warning" role="alert" title={search.error.raw}>
                    {t(animeErrorKey(search.error.code))}
                </p>
            )}
            {search.status === 'done' && search.results.length === 0 && <p className="empty">{t('anime.results.none')}</p>}
            {search.status === 'done' && search.results.length > 0 && (
                <>
                    <span className="section-label">{t('anime.results.label', { count: search.results.length })}</span>
                    <ul className="history__list">
                        {search.results.map((result) => {
                            return (
                                <li key={result.index} className="history__item">
                                    <div className="history__main">
                                        <span className="history__title" title={result.title}>
                                            {result.title}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn--small"
                                        aria-label={`${t('anime.open')}: ${result.title}`}
                                        onClick={() => {
                                            void openResult(result);
                                        }}
                                    >
                                        {t('anime.open')}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </section>
    );
}
