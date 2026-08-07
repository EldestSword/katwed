import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LoadingScreen } from '../components/LoadingScreen'
import { StatusMessage } from '../components/StatusMessage'
import { StoredImage } from '../components/StoredImage'
import {
  cleanupButtonLabel,
  cleanupResultMessage,
  formatBytes,
  formatStorageDate,
  storageItemLabel,
  type StorageReport,
  type StorageSummary,
} from '../features/storage-manager/storageManager'
import { repository } from '../services/repository'

function SummaryCard({ label, summary, noun = 'image' }: {
  label: string
  summary: StorageSummary
  noun?: string
}) {
  return (
    <article className="storage-summary-card">
      <h2>{label}</h2>
      <p className="storage-summary-card__value">
        {storageItemLabel(summary.fileCount, noun)} <span aria-hidden="true">·</span> {formatBytes(summary.sizeBytes)}
      </p>
      {summary.unknownSizeCount > 0 && (
        <p className="storage-summary-card__note">
          Size unavailable for {storageItemLabel(summary.unknownSizeCount, 'file')}.
        </p>
      )}
    </article>
  )
}

export function HostStoragePage() {
  const [report, setReport] = useState<StorageReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const unusedObjects = useMemo(
    () => report?.objects.filter((object) => object.status === 'unused') ?? [],
    [report],
  )

  async function refresh(isManual = false) {
    if (isManual) setRefreshing(true)
    try {
      setReport(await repository.getStorageReport())
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Storage could not be loaded.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function cleanup() {
    if (!report || !unusedObjects.length) return
    const message = `Delete ${storageItemLabel(unusedObjects.length, 'unused image')} (${formatBytes(report.unused.sizeBytes)})?\n\nKatwed will re-check that these files are still unused before deleting them. This cannot be undone.`
    if (!window.confirm(message)) return
    setCleaning(true)
    setError('')
    setNotice('')
    try {
      const result = await repository.cleanupUnusedImages(unusedObjects.map((object) => object.path))
      setNotice(cleanupResultMessage(result))
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unused images could not be cleaned up.')
    } finally {
      setCleaning(false)
    }
  }

  if (loading) return <LoadingScreen message="Checking image storage…" />

  return (
    <main className="host-page storage-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Host maintenance</p>
          <h1>Storage</h1>
          <p>Uploaded images for this Katwed account.</p>
        </div>
        <div className="heading-actions">
          <Link className="button button--secondary" to="/host">Your quizzes</Link>
          <button
            className="button button--ghost"
            type="button"
            disabled={refreshing || cleaning}
            onClick={() => void refresh(true)}
          >{refreshing ? 'Refreshing…' : 'Refresh Storage'}</button>
        </div>
      </header>

      <p className="storage-scope-note">
        These figures cover Katwed images in your folder in the question-images bucket. They do not include other hosts, database storage, Netlify usage or your wider Supabase account.
      </p>
      {notice && <StatusMessage tone="success">{notice}</StatusMessage>}
      {error && <StatusMessage tone="error">{error}</StatusMessage>}

      {report && (
        <>
          <section className="storage-summary-grid" aria-label="Storage usage">
            <SummaryCard label="Total" summary={report.total} />
            <SummaryCard label="In use" summary={report.inUse} />
            <SummaryCard label="Unused" summary={report.unused} />
            {report.protected.fileCount > 0 && (
              <SummaryCard label="Other / protected" summary={report.protected} noun="file" />
            )}
          </section>

          <section className="storage-unused-section" aria-labelledby="unused-images-heading">
            <div className="section-heading">
              <div>
                <h2 id="unused-images-heading">Unused images</h2>
                <p>Review images Katwed can safely identify as no longer referenced by any quiz.</p>
              </div>
              {unusedObjects.length > 0 && (
                <button
                  className="button button--primary danger-button"
                  type="button"
                  disabled={cleaning}
                  onClick={() => void cleanup()}
                >{cleaning ? 'Cleaning up…' : cleanupButtonLabel(unusedObjects.length)}</button>
              )}
            </div>

            {unusedObjects.length === 0 ? (
              <div className="empty-card storage-empty-state">
                <h3>No unused images</h3>
                <p>Everything Katwed can safely identify in your Storage is currently referenced.</p>
              </div>
            ) : (
              <div className="storage-image-grid">
                {unusedObjects.map((object) => {
                  const created = formatStorageDate(object.createdAt)
                  return (
                    <article className="storage-image-card" key={object.path}>
                      <div className="storage-image-card__preview">
                        <StoredImage
                          reference={object.publicUrl}
                          alt=""
                          fallback={<div className="image-fallback" role="img" aria-label="Stored image preview unavailable">Preview unavailable</div>}
                        />
                      </div>
                      <div className="storage-image-card__details">
                        <strong>Unused image</strong>
                        <span>{object.sizeBytes === null ? 'Size unavailable' : formatBytes(object.sizeBytes)}</span>
                        {created && object.createdAt && <time dateTime={object.createdAt}>Uploaded {created}</time>}
                        <details><summary>File details</summary><code title={object.path}>{object.path}</code></details>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}
