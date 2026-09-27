import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice } from '../components/shared.jsx';
import { downloadBlob, readFileAsBase64 } from './DocumentsGedcomView.jsx';

export function LoginForm({ onLogin, loginError }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    onLogin(name.trim(), pin.trim() || undefined);
  };

  return (
    <form className="create-person-form" onSubmit={handleSubmit}>
      <p className="notice">
        Les sauvegardes, la restauration, la corbeille et le profil sont des opérations sensibles :
        connectez-vous avec un profil local pour y accéder.
      </p>
      <label>
        <span>Profil local</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        <span>Code PIN (optionnel)</span>
        <input type="password" value={pin} onChange={(event) => setPin(event.target.value)} />
      </label>
      {loginError ? <ErrorNotice message={loginError} /> : null}
      <Button type="submit" size="sm">
        Se connecter
      </Button>
    </form>
  );
}

// Emplacements : copie miroir des sauvegardes et dossier de travail portable (clé USB).
export function StorageSection({ token }) {
  const [status, setStatus] = useState(null);
  const [mirrorDir, setMirrorDir] = useState('');
  const [dataDir, setDataDir] = useState('');
  const [message, setMessage] = useState(null);
  const [storageError, setStorageError] = useState(null);

  const load = useCallback(async () => {
    try {
      const loaded = await client.storage?.status();
      if (!loaded) return;
      setStatus(loaded);
      setMirrorDir(loaded.mirrorDir ?? '');
      setDataDir(loaded.dataDir ?? '');
    } catch (loadError) {
      setStorageError(loadError.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!client.storage || !status) return null;

  const run = async (action, success) => {
    setStorageError(null);
    setMessage(null);
    try {
      const result = await action();
      setStatus(result);
      setMessage(success(result));
    } catch (actionError) {
      setStorageError(actionError.message);
    }
  };

  return (
    <section className="storage-section" aria-labelledby="storage-title">
      <h3 id="storage-title">Clé USB et emplacement des données</h3>
      {storageError ? <ErrorNotice message={storageError} /> : null}
      {message ? (
        <p role="status" className="notice">
          {message}
        </p>
      ) : null}
      <p className="data-id">Données actuelles : {status.activeDataDir}</p>

      <form
        className="storage-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => client.storage.setMirror(mirrorDir.trim() || null, token),
            (result) =>
              result.mirrorDir
                ? 'Chaque sauvegarde sera aussi copiée sur ce dossier dès qu’il est branché.'
                : 'Copie miroir désactivée.',
          );
        }}
      >
        <label>
          <span>Copie miroir des sauvegardes (ex. /Volumes/CLE_USB/GeneoApp)</span>
          <input value={mirrorDir} onChange={(event) => setMirrorDir(event.target.value)} />
        </label>
        <Button type="submit" size="sm" variant="secondary">
          Enregistrer le miroir
        </Button>
        {status.mirrorDir ? (
          <p className="data-id">
            {status.mirrorAvailable
              ? 'Miroir branché et accessible'
              : 'Miroir absent (clé débranchée ?)'}
          </p>
        ) : null}
      </form>

      <form
        className="storage-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => client.storage.setDataDir(dataDir.trim() || null, token),
            (result) =>
              result.dataDir
                ? `${result.copied ? 'Arbres, médias et sauvegardes copiés. ' : 'Données GeneoApp trouvées sur ce dossier. '}Redémarrez GeneoApp pour travailler directement dessus.`
                : 'Retour au dossier de l’application au prochain démarrage.',
          );
        }}
      >
        <label>
          <span>Travailler directement sur un dossier (clé USB)</span>
          <input value={dataDir} onChange={(event) => setDataDir(event.target.value)} />
        </label>
        <Button type="submit" size="sm" variant="secondary">
          Utiliser ce dossier de travail
        </Button>
        {status.restartRequired ? (
          <p className="data-id">Changement en attente : effectif au prochain démarrage.</p>
        ) : null}
      </form>
    </section>
  );
}

export function BackupsPanel({ session, onLogin, loginError, onLogout, section = 'backups' }) {
  const [backups, setBackups] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [removePin, setRemovePin] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [backupStatus, setBackupStatus] = useState(null);
  const [trashItems, setTrashItems] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setBackups(await client.backups.list(session.token));
      setTrashItems(await client.trash.list());
    } catch (loadError) {
      setActionError(loadError.message);
    }
  }, [session]);

  useEffect(() => {
    if (session) loadAll();
  }, [session, loadAll]);

  if (!session) {
    return <LoginForm onLogin={onLogin} loginError={loginError} />;
  }

  const handleCreateBackup = async (kind) => {
    setBusy(true);
    setActionError(null);
    try {
      await client.backups.create({ kind }, session.token);
      await loadAll();
    } catch (createError) {
      setActionError(createError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (backup) => {
    setBusy(true);
    setActionError(null);
    setBackupStatus(null);
    try {
      // SQLite : remplacement du fichier (effectif au redémarrage) ; JSON : immédiat.
      const kind = backup.kind === 'sqlite' ? 'sqlite' : 'logical';
      const result = await client.backups.restore(backup.filename, kind, session.token);
      setBackupStatus(
        result?.restartRequired
          ? 'Restauration préparée : redémarrez GeneoApp pour retrouver cette version.'
          : 'Sauvegarde restaurée.',
      );
      await loadAll();
    } catch (restoreError) {
      setActionError(restoreError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleExportEncrypted = async (backup) => {
    setActionError(null);
    setBackupStatus(null);
    try {
      const result = await client.backups.exportEncrypted(
        backup.filename,
        passphrase,
        session.token,
      );
      const bytes = Uint8Array.from(atob(result.contentBase64), (char) => char.charCodeAt(0));
      downloadBlob(result.filename, new Blob([bytes], { type: 'application/octet-stream' }));
      setBackupStatus(
        'Copie chiffrée prête : conservez la phrase secrète, elle est indispensable.',
      );
    } catch (exportError) {
      setActionError(exportError.message);
    }
  };

  const handleImportEncrypted = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setActionError(null);
    setBackupStatus(null);
    try {
      await client.backups.importEncrypted(await readFileAsBase64(file), passphrase, session.token);
      setBackupStatus(
        'Sauvegarde chiffrée déchiffrée et ajoutée à la liste : vous pouvez la restaurer.',
      );
      await loadAll();
    } catch (importError) {
      setActionError(importError.message);
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const handleTrashRestore = async (table, id) => {
    setBusy(true);
    setActionError(null);
    try {
      await client.trash.restore(table, id, session.token);
      await loadAll();
    } catch (restoreError) {
      setActionError(restoreError.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePurge = async (table, id) => {
    setBusy(true);
    setActionError(null);
    try {
      await client.trash.purge(table, id, session.token);
      await loadAll();
    } catch (purgeError) {
      setActionError(purgeError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await client.accounts.logout(session.token);
      onLogout();
    } catch (logoutError) {
      setActionError(logoutError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveAccount = async () => {
    setBusy(true);
    setActionError(null);
    try {
      if (removePin) {
        await client.accounts.remove(session.account.id, session.token, removePin);
      } else {
        await client.accounts.remove(session.account.id, session.token);
      }
      onLogout();
    } catch (removeError) {
      setActionError(removeError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="backups-panel">
      {actionError ? <ErrorNotice message={actionError} /> : null}

      <section className="session-banner">
        <h3>Profil connecté : {session.account.name}</h3>
        <div className="gedcom-panel__actions">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleLogout}
            disabled={busy}
          >
            Se déconnecter
          </Button>
        </div>
      </section>

      {section === 'profile' ? (
        <section>
          <h3>Profil local</h3>
          <dl className="profile-details">
            <div>
              <dt>Nom du profil</dt>
              <dd>{session.account.name}</dd>
            </div>
            <div>
              <dt>Protection</dt>
              <dd>{session.account.hasPin ? 'Code PIN activé' : 'Sans code PIN'}</dd>
            </div>
            <div>
              <dt>Stockage</dt>
              <dd>Local à cet appareil, aucun compte en ligne</dd>
            </div>
          </dl>
          <div className="danger-zone">
            <h4>Zone sensible</h4>
            <p className="settings-hint">
              Supprimer le profil retire l’accès aux sauvegardes et à la corbeille pour ce nom. Les
              personnes de l’arbre ne sont pas supprimées.
            </p>
            {confirming === 'account' ? (
              <div className="gedcom-panel__actions">
                {session.account.hasPin ? (
                  <input
                    type="password"
                    aria-label="Code PIN du profil"
                    placeholder="Code PIN"
                    value={removePin}
                    onChange={(event) => setRemovePin(event.target.value)}
                  />
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={handleRemoveAccount}
                  disabled={busy || (session.account.hasPin && !removePin)}
                >
                  Confirmer la suppression du profil
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setConfirming(null);
                    setRemovePin('');
                  }}
                >
                  Annuler
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => setConfirming('account')}
                disabled={busy}
              >
                Supprimer ce profil
              </Button>
            )}
          </div>
        </section>
      ) : null}

      {section === 'backups' ? (
        <section>
          <h3>Sauvegardes</h3>
          <p className="settings-hint">
            Sauvegardes automatiques au lancement, avant chaque import GEDCOM et avant chaque mise à
            jour de la base (10 conservées par motif). Les sauvegardes manuelles ne sont jamais
            supprimées.
          </p>
          {backupStatus ? (
            <p role="status" className="notice">
              {backupStatus}
            </p>
          ) : null}
          <fieldset className="encrypted-backup">
            <legend>Copie chiffrée (clé USB, disque externe)</legend>
            <label>
              <span>Phrase secrète (12 caractères minimum)</span>
              <input
                type="password"
                autoComplete="new-password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
            </label>
            <label className="gedcom-panel__file">
              <span>Importer une sauvegarde chiffrée (.gnapenc)</span>
              <input
                type="file"
                accept=".gnapenc"
                onChange={handleImportEncrypted}
                disabled={busy || passphrase.length < 12}
              />
            </label>
            <p className="settings-hint">
              Chiffrement AES-256-GCM. Sans la phrase secrète, la copie est illisible : elle ne peut
              pas être récupérée.
            </p>
          </fieldset>
          <div className="gedcom-panel__actions">
            <Button
              type="button"
              size="sm"
              onClick={() => handleCreateBackup('json')}
              disabled={busy}
            >
              Créer une sauvegarde (JSON)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => handleCreateBackup('sqlite')}
              disabled={busy}
            >
              Créer une sauvegarde (SQLite)
            </Button>
          </div>
          {backups === null ? (
            <p role="status">Chargement…</p>
          ) : backups.length === 0 ? (
            <p className="notice">Aucune sauvegarde pour l’instant.</p>
          ) : (
            <ul className="search-results">
              {backups.map((backup) => (
                <li key={backup.filename}>
                  <span className="backup-row__main">
                    <strong>
                      {backup.createdAt
                        ? new Date(backup.createdAt).toLocaleString('fr-FR')
                        : backup.filename}
                    </strong>
                    <span className="data-id">
                      {backup.kind === 'sqlite' ? 'SQLite' : 'JSON'} ·{' '}
                      {backup.label?.startsWith('auto:')
                        ? `Automatique · ${backup.label.slice(5)}`
                        : (backup.label ?? 'Manuelle')}
                      {backup.sizeBytes
                        ? ` · ${Math.max(1, Math.round(backup.sizeBytes / 1024))} Ko`
                        : ''}
                    </span>
                    {backup.createdAt ? (
                      <span className="data-id backup-row__file">{backup.filename}</span>
                    ) : null}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleRestore(backup)}
                    disabled={busy}
                  >
                    Restaurer
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleExportEncrypted(backup)}
                    disabled={busy || passphrase.length < 12}
                    aria-label={`Exporter chiffrée la sauvegarde du ${backup.createdAt ? new Date(backup.createdAt).toLocaleString('fr-FR') : backup.filename}`}
                  >
                    Exporter chiffrée
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {section === 'backups' ? <StorageSection token={session.token} /> : null}

      {section === 'trash' ? (
        <section>
          <h3>Corbeille</h3>
          <p className="settings-hint">
            Suppression logique : tout élément reste restaurable ici tant qu’il n’est pas purgé.
          </p>
          {trashItems === null ? (
            <p role="status">Chargement…</p>
          ) : trashItems.length === 0 ? (
            <p className="notice">La corbeille est vide.</p>
          ) : (
            <ul className="search-results">
              {trashItems.map((item) => (
                <li key={`${item.table}:${item.id}`}>
                  <Badge tone="neutral">{item.table}</Badge> {item.label}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleTrashRestore(item.table, item.id)}
                    disabled={busy}
                  >
                    Restaurer
                  </Button>
                  {confirming === `${item.table}:${item.id}` ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setConfirming(null);
                          handlePurge(item.table, item.id);
                        }}
                        disabled={busy}
                      >
                        Confirmer la purge
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setConfirming(null)}
                      >
                        Annuler
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => setConfirming(`${item.table}:${item.id}`)}
                      disabled={busy}
                    >
                      Purger définitivement
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
