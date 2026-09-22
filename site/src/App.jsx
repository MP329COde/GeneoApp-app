import { Badge, Button, LanguageSwitcher } from '@design-system';

const FEATURES = [
  {
    title: '100 % locale',
    text: "Aucune donnée n'est envoyée vers un service tiers. L'application fonctionne entièrement hors-ligne.",
  },
  {
    title: 'Sauvegarde & restauration',
    text: 'Export SQLite ou JSON, vérifié par somme de contrôle SHA-256, restaurable sans dépendance réseau.',
  },
  {
    title: 'Accessible par conception',
    text: 'Navigation clavier complète, contrastes WCAG 2.1 AA, jamais une information portée par la seule couleur.',
  },
  {
    title: 'Multi-plateforme',
    text: 'Distribuée via Electron : installeurs macOS, Windows et Linux depuis les mêmes sources.',
  },
];

export function App() {
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
          <Badge tone="success">Projet open, en gouvernance</Badge>
          <h1>Généalogie 100 % locale</h1>
          <p>
            GeneoApp est une application de généalogie qui fonctionne entièrement sur votre
            ordinateur, sans compte en ligne ni synchronisation cloud.
          </p>
          <div className="site__cta">
            <Button
              variant="primary"
              size="lg"
              onClick={() =>
                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Découvrir les fonctionnalités
            </Button>
          </div>
        </section>

        <section className="site__features" id="features" aria-label="Fonctionnalités">
          {FEATURES.map((feature) => (
            <article className="site__feature" key={feature.title}>
              <h2>{feature.title}</h2>
              <p>{feature.text}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="site__footer">
        <p>Ce site est une vitrine statique, indépendante de l&rsquo;application (ADR 0009).</p>
      </footer>
    </div>
  );
}
