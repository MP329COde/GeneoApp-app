import { Badge, Button, LanguageSwitcher, useTranslation } from '@design-system';

const FEATURES = [
  { key: 'local', title: 'site.feature.local.title', text: 'site.feature.local.text' },
  {
    key: 'genealogy',
    title: 'site.feature.genealogy.title',
    text: 'site.feature.genealogy.text',
  },
  { key: 'backup', title: 'site.feature.backup.title', text: 'site.feature.backup.text' },
  {
    key: 'indexation',
    title: 'site.feature.indexation.title',
    text: 'site.feature.indexation.text',
  },
  { key: 'a11y', title: 'site.feature.a11y.title', text: 'site.feature.a11y.text' },
  { key: 'multi', title: 'site.feature.multi.title', text: 'site.feature.multi.text' },
];

const SCREENSHOTS = [
  { file: '02-arbre.png', caption: 'site.gallery.tree.caption' },
  { file: '15-carte.png', caption: 'site.gallery.map.caption' },
  { file: '17-carnet.png', caption: 'site.gallery.notebook.caption' },
  { file: '14-chronologie.png', caption: 'site.gallery.timeline.caption' },
  { file: '08-doublons.png', caption: 'site.gallery.duplicates.caption' },
  { file: '19-ia-locale.png', caption: 'site.gallery.ai.caption' },
];

export function App() {
  const { t } = useTranslation();

  return (
    <div className="site">
      <header className="site__header">
        <div className="site__brand">
          <span className="site__logo" aria-hidden="true">
            🌳
          </span>
          <span className="site__name">GeneoApp</span>
        </div>
        <LanguageSwitcher />
      </header>

      <main>
        <section className="site__hero">
          <Badge tone="success">{t('site.badge', 'Projet open, en gouvernance')}</Badge>
          <h1>{t('site.title', 'Généalogie 100 % locale')}</h1>
          <p>
            {t(
              'site.intro',
              'GeneoApp est une application de généalogie qui fonctionne entièrement sur votre ordinateur, sans compte en ligne ni synchronisation cloud.',
            )}
          </p>
          <div className="site__cta">
            <Button
              variant="primary"
              size="lg"
              onClick={() =>
                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              {t('site.cta', 'Découvrir les fonctionnalités')}
            </Button>
          </div>
        </section>

        <section
          className="site__features"
          id="features"
          aria-label={t('site.features.label', 'Fonctionnalités')}
        >
          {FEATURES.map((feature) => (
            <article className="site__feature" key={feature.key}>
              <h2>{t(feature.title)}</h2>
              <p>{t(feature.text)}</p>
            </article>
          ))}
        </section>

        <section
          className="site__gallery"
          aria-labelledby="site-gallery-title"
          aria-label={t('site.gallery.label', 'Captures d’écran')}
        >
          <h2 id="site-gallery-title">{t('site.gallery.label', 'Captures d’écran')}</h2>
          <p className="site__gallery-intro">
            {t('site.gallery.intro', 'L’application, telle qu’elle fonctionne sur votre machine.')}
          </p>
          <ul className="site__gallery-list">
            {SCREENSHOTS.map((shot) => (
              <li className="site__gallery-item" key={shot.file}>
                <img
                  className="site__gallery-image"
                  src={`captures/${shot.file}`}
                  alt={t(shot.caption)}
                  loading="lazy"
                  width={1440}
                  height={900}
                />
                <p className="site__gallery-caption">{t(shot.caption)}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="site__footer">
        <p>
          {t(
            'site.footer',
            "Ce site est une vitrine statique, indépendante de l'application (ADR 0009).",
          )}
        </p>
      </footer>
    </div>
  );
}
