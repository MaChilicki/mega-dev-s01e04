import type { DigestRow, NightDigest } from '../digest/types.js';

function DigestRowView({ row }: { row: DigestRow }) {
  const warning = row.retries >= 3 || row.failures > 0;
  return (
    <tr data-job={row.job} class={warning ? 'warn' : undefined}>
      <td data-field="job">{row.job}</td>
      <td data-field="owner">{row.owner ?? '—'}</td>
      <td data-field="runs">{row.runs}</td>
      <td data-field="retries">{row.retries}</td>
      <td data-field="last-status">{row.lastStatus}</td>
      <td data-field="last-error">{row.lastError ?? '—'}</td>
      <td data-field="first-time">{row.firstTime}</td>
      <td data-field="last-time">{row.lastTime}</td>
    </tr>
  );
}

export function DigestPage({ digest }: { digest: NightDigest }) {
  return (
    <section>
      <h1>Digest · {digest.night}</h1>
      <p data-bad-lines={digest.badLines}>Bad lines: {digest.badLines}</p>
      {digest.rows.length === 0 ? (
        <p>nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Job</th>
              <th scope="col">Owner</th>
              <th scope="col">Runs</th>
              <th scope="col">Retries</th>
              <th scope="col">Last status</th>
              <th scope="col">Last error</th>
              <th scope="col">First</th>
              <th scope="col">Last</th>
            </tr>
          </thead>
          <tbody>{digest.rows.map((row) => <DigestRowView key={row.job} row={row} />)}</tbody>
        </table>
      )}
    </section>
  );
}
