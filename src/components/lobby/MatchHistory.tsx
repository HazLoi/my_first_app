import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';
import { apiFetch } from '@/services/apiClient';

interface HistoryPlayer {
  user_id: string | null;
  name: string;
  total: number;
  rank: number;
  left: boolean;
}

interface HistoryMatch {
  id: string;
  gameType: string;
  tableName: string;
  targetScore: number | null;
  status: 'finished' | 'abandoned';
  endedAt: string;
  players: HistoryPlayer[];
  rounds: Array<{ points: number[]; events: string }>;
}

interface HistoryList {
  matches: HistoryMatch[];
  hasMore: boolean;
}

export function MatchHistory({ token, onClose }: { token: string; onClose(): void }) {
  const [game, setGame] = useState('');
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<HistoryList | null>(null);
  const [detail, setDetail] = useState<HistoryMatch | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ action: 'list', page: String(page), game_type: game, name: search });
    setList(null);
    setError('');
    apiFetch<HistoryList>(`/history.php?${params}`, { token, signal: controller.signal })
      .then(({ data }) => setList(data))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Không tải được lịch sử.');
      });
    return () => controller.abort();
  }, [game, page, search, token]);

  const open = async (id: string): Promise<void> => {
    setError('');
    try {
      const { data } = await apiFetch<{ match: HistoryMatch }>(`/history.php?action=detail&id=${encodeURIComponent(id)}`, { token });
      setDetail(data.match);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được trận.');
    }
  };

  return (
    <Modal title="Lịch sử trận" onClose={onClose} width={1400}>
      {detail ? (
        <div className="match-history">
          <button type="button" className="btn" onClick={() => setDetail(null)}>◀ Danh sách</button>
          <p>{detail.tableName} · {detail.status === 'finished' ? 'Hoàn thành' : 'Dừng giữa trận'} · Đích {detail.targetScore}</p>
          <div className="match-history-scroll"><table>
            <thead><tr><th>Ván</th>{detail.players.map((player, index) => <th key={index}>{player.name}{player.left ? ' (đã rời)' : ''}</th>)}<th>Sự kiện</th></tr></thead>
            <tbody>
              {detail.rounds.map((round, index) => <tr key={index}><td>{index + 1}</td>{round.points.map((points, i) => <td key={i}>{points > 0 ? `+${points}` : points}</td>)}<td>{round.events || '—'}</td></tr>)}
              <tr><th>Tổng</th>{detail.players.map((player, index) => <th key={index}>{player.total} (hạng {player.rank})</th>)}<td /></tr>
            </tbody>
          </table></div>
        </div>
      ) : (
        <div className="match-history">
          <form className="match-history-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(name); }}>
            <select value={game} onChange={(event) => { setGame(event.target.value); setPage(1); }} aria-label="Lọc game">
              <option value="">Tất cả game</option><option value="tienlen">Tiến Lên</option><option value="xapxam">Xập Xám</option>
            </select>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Tên người chơi" maxLength={50} />
            <button type="submit" className="btn">Tìm</button>
          </form>
          {error ? <p className="modal-error">{error}</p> : null}
          {!list && !error ? <p>Đang tải...</p> : null}
          {list && list.matches.length === 0 ? <p>Chưa có trận phù hợp.</p> : null}
          <div className="match-history-scroll">
            {list?.matches.map((match) => {
              const winner = match.players.find((player) => player.rank === 1);
              return <button type="button" className="match-history-item" key={match.id} onClick={() => void open(match.id)}>
                <span>{match.endedAt} UTC · {match.gameType === 'tienlen' ? 'Tiến Lên' : 'Xập Xám'} · {match.tableName}</span>
                <span>{match.status === 'abandoned' ? 'Dừng giữa trận · ' : ''}{winner ? `${winner.name}: ${winner.total} điểm` : 'Chưa có người thắng'}</span>
              </button>;
            })}
          </div>
          <div className="match-history-pages"><button type="button" className="btn" disabled={page === 1} onClick={() => setPage(page - 1)}>Trước</button>
            <span>Trang {page}</span><button type="button" className="btn" disabled={!list?.hasMore} onClick={() => setPage(page + 1)}>Sau</button></div>
        </div>
      )}
      {detail && error ? <p className="modal-error">{error}</p> : null}
    </Modal>
  );
}
