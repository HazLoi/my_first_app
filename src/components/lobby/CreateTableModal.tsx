import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { STAKES } from '@/config/rules';
import { getGame, type GameId } from '@/config/games';
import {
  TIENLEN_SCORING_DEFAULTS, TIENLEN_SCORING_DEFAULT_MODE, TIENLEN_SCORING_DEFAULT_TARGET,
  TIENLEN_SCORING_TARGETS, TIENLEN_SCORING_TARGET_MAX, TIENLEN_SCORING_TARGET_MIN,
  TIENLEN_SCORING_VALUE_MAX, TIENLEN_SCORING_VALUE_MIN, TIENLEN_SCORING_BONUS_MAX,
} from '@/config/tienlen-scoring';
import { formatChips, t } from '@/i18n';
import { PASSWORD_MAX, canAfford, minBalanceFor, quickPlayStake } from '@/lib/lobbyLogic';
import type { CreateTableOptions } from '@/services/types';

interface CreateTableModalProps {
  balance: number;
  gameType: GameId;
  initialPublic?: boolean;
  busy: boolean;
  onSubmit(options: CreateTableOptions): void;
  onReturnToTable(): void;
  onClose(): void;
}

const PLAYER_OPTIONS = [2, 3, 4] as const;
const copyRankPoints = () => ({
  2: [...TIENLEN_SCORING_DEFAULTS.rankPoints[2]!],
  3: [...TIENLEN_SCORING_DEFAULTS.rankPoints[3]!],
  4: [...TIENLEN_SCORING_DEFAULTS.rankPoints[4]!],
});

export function CreateTableModal({ balance, gameType, initialPublic = true, busy, onSubmit, onReturnToTable, onClose }: CreateTableModalProps) {
  const game = getGame(gameType);
  const [stake, setStake] = useState<number>(() => gameType === 'tienlen'
    ? game.betLevels.filter((value) => value <= 200 && canAfford(balance, value)).sort((a, b) => b - a)[0] ?? game.betLevels[0]!
    : quickPlayStake(balance) ?? STAKES[0]);
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4>(game.maxPlayers === 2 || game.maxPlayers === 3 ? game.maxPlayers : 4);
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [password, setPassword] = useState('');
  const [showScoring, setShowScoring] = useState(false);
  const [scoringMode, setScoringMode] = useState<'points' | 'coins'>(TIENLEN_SCORING_DEFAULT_MODE);
  const [targetScore, setTargetScore] = useState(TIENLEN_SCORING_DEFAULT_TARGET);
  const [targetInput, setTargetInput] = useState(String(TIENLEN_SCORING_DEFAULT_TARGET));
  const [showTargetInput, setShowTargetInput] = useState(false);
  const [rankPoints, setRankPoints] = useState<Record<number, number[]>>(copyRankPoints);
  const [chopValues, setChopValues] = useState({ ...TIENLEN_SCORING_DEFAULTS.chopValues });
  const [chopperGains, setChopperGains] = useState(TIENLEN_SCORING_DEFAULTS.chopperGains);
  const [chopOverMode, setChopOverMode] = useState<'last-pays-all' | 'stack'>('last-pays-all');
  const [coverShortfall, setCoverShortfall] = useState(false);
  const [whiteEnabled, setWhiteEnabled] = useState(TIENLEN_SCORING_DEFAULTS.whiteEnabled);
  const [bonusPerOpponent, setBonusPerOpponent] = useState(TIENLEN_SCORING_DEFAULTS.bonusPerOpponent);
  const [coldEnabled, setColdEnabled] = useState(TIENLEN_SCORING_DEFAULTS.coldEnabled);
  const [coldPenalty, setColdPenalty] = useState(TIENLEN_SCORING_DEFAULTS.coldPenalty);
  const [rottenEnabled, setRottenEnabled] = useState(TIENLEN_SCORING_DEFAULTS.rottenEnabled);
  const [whiteTypes, setWhiteTypes] = useState({ ...TIENLEN_SCORING_DEFAULTS.whiteTypes });
  const poor = (gameType !== 'tienlen' || scoringMode === 'coins') && !canAfford(balance, stake);
  const targetValid = /^[0-9]+$/.test(targetInput) && Number(targetInput) >= TIENLEN_SCORING_TARGET_MIN && Number(targetInput) <= TIENLEN_SCORING_TARGET_MAX;
  const validNumber = (value: number, min: number, max: number): boolean => Number.isInteger(value) && value >= min && value <= max;
  const rulesValid = Object.values(rankPoints).every((points) => points.every((point) => validNumber(point, TIENLEN_SCORING_VALUE_MIN, TIENLEN_SCORING_VALUE_MAX)))
    && Object.values(chopValues).every((point) => validNumber(point, TIENLEN_SCORING_VALUE_MIN, 0))
    && validNumber(coldPenalty, TIENLEN_SCORING_VALUE_MIN, 0)
    && validNumber(bonusPerOpponent, 0, TIENLEN_SCORING_BONUS_MAX);
  const setTarget = (value: number): void => {
    const next = Math.max(TIENLEN_SCORING_TARGET_MIN, Math.min(TIENLEN_SCORING_TARGET_MAX, value));
    setTargetScore(next);
    setTargetInput(String(next));
  };
  const reset = (): void => {
    setScoringMode(TIENLEN_SCORING_DEFAULT_MODE); setTarget(TIENLEN_SCORING_DEFAULT_TARGET); setShowTargetInput(false);
    setRankPoints(copyRankPoints()); setChopValues({ ...TIENLEN_SCORING_DEFAULTS.chopValues });
    setChopperGains(TIENLEN_SCORING_DEFAULTS.chopperGains); setChopOverMode('last-pays-all'); setCoverShortfall(false);
    setWhiteEnabled(TIENLEN_SCORING_DEFAULTS.whiteEnabled); setBonusPerOpponent(TIENLEN_SCORING_DEFAULTS.bonusPerOpponent);
    setColdEnabled(TIENLEN_SCORING_DEFAULTS.coldEnabled); setColdPenalty(TIENLEN_SCORING_DEFAULTS.coldPenalty);
    setRottenEnabled(TIENLEN_SCORING_DEFAULTS.rottenEnabled); setWhiteTypes({ ...TIENLEN_SCORING_DEFAULTS.whiteTypes });
  };
  const submit = (): void => onSubmit({
    stake, maxPlayers, isPublic, password: password || undefined,
    ...(gameType === 'tienlen' ? {
      scoringMode, targetScore, scoringConfig: {
        rankPoints, chopValues, chopperGains, chopOverMode, coverShortfallByEarlierVictims: coverShortfall,
        whiteEnabled, bonusPerOpponent, whiteTypes, coldEnabled, coldPenalty, rottenEnabled,
      },
    } : {}),
  });
  const summary = `${game.name} · ${maxPlayers} người${gameType === 'tienlen' ? ` · ${scoringMode === 'points' ? `Tính điểm · Đích ${targetScore}` : 'Tính xu'}` : ''}`;

  return (
    <Modal title={showScoring ? 'Luật chi tiết' : t('lobby.create.title')} onClose={onClose} width={1000}
      headerStart={showScoring ? <button className="btn create-back" type="button" onClick={() => setShowScoring(false)}>◂ Quay lại</button> : undefined}
      footer={showScoring ? <div className="create-footer-actions"><button className="btn" type="button" onClick={reset}>Mặc định</button>
        <button className="btn" type="button" onClick={() => setShowScoring(false)}>Quay lại</button></div> :
        <><div className="create-summary">{summary}</div><div className="create-footer-actions">
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
          <button type="button" className="btn btn-green" disabled={busy || poor || (gameType === 'tienlen' && (!rulesValid || (scoringMode === 'points' && !targetValid)))} onClick={submit}>{t('lobby.create.submit')}</button>
        </div></>}>
      {showScoring ? <div className="create-rules">
        <details><summary>Điểm theo hạng</summary>
          {[2, 3, 4].map((count) => <div key={count} className="chip-row create-rank-row">
            <span>{count} người:</span>
            {rankPoints[count]!.map((point, index) => <div key={index}><input className="modal-field create-number"
              aria-label={`Điểm hạng ${index + 1}, ${count} người`} type="number" min={TIENLEN_SCORING_VALUE_MIN} max={TIENLEN_SCORING_VALUE_MAX} value={point}
              onChange={(event) => setRankPoints((current) => ({ ...current, [count]: current[count]!.map((value, i) => i === index ? Number(event.target.value) || 0 : value) }))} />
              {!validNumber(point, TIENLEN_SCORING_VALUE_MIN, TIENLEN_SCORING_VALUE_MAX) ? <p className="modal-error">-50–50</p> : null}</div>)}
          </div>)}
        </details>
        <details><summary>Điểm khi bị chặt</summary>
          {([
            ['black_two', 'Heo đen'], ['red_two', 'Heo đỏ'], ['four', 'Tứ quý'],
            ['pairs_run_3', 'Ba đôi thông'], ['pairs_run_4', 'Bốn đôi thông'],
          ] as const).map(([key, label]) => <div key={key}><label className="create-rule-row"><span>{label}</span>
            <input className="modal-field create-number" type="number" min={TIENLEN_SCORING_VALUE_MIN} max={0} value={chopValues[key]}
              onChange={(event) => setChopValues((current) => ({ ...current, [key]: Number(event.target.value) || 0 }))} />
          </label>{!validNumber(chopValues[key], TIENLEN_SCORING_VALUE_MIN, 0) ? <p className="modal-error">Nhập số nguyên từ -50 đến 0.</p> : null}</div>)}
          <label><input type="checkbox" checked={chopperGains} onChange={(event) => setChopperGains(event.target.checked)} /> Người chặt được cộng điểm</label>
        </details>
        <details><summary>Cách tính chặt đè</summary>
          <label><input type="checkbox" checked={chopOverMode === 'stack'} onChange={(event) => setChopOverMode(event.target.checked ? 'stack' : 'last-pays-all')} /> Tính từng lớp (stack)</label>
          {chopOverMode === 'last-pays-all' ? <label><input type="checkbox" checked={coverShortfall} onChange={(event) => setCoverShortfall(event.target.checked)} /> Người bị chặt trước bù xu còn thiếu</label> : null}
        </details>
        <details><summary>Tới trắng</summary>
          <label><input type="checkbox" checked={whiteEnabled} onChange={(event) => setWhiteEnabled(event.target.checked)} /> Bật tới trắng</label>
          {whiteEnabled ? <>
            <label className="create-rule-row"><span>Bonus mỗi đối thủ</span><input className="modal-field create-number" type="number" min={0} max={TIENLEN_SCORING_BONUS_MAX} value={bonusPerOpponent}
              onChange={(event) => setBonusPerOpponent(Math.max(0, Math.min(TIENLEN_SCORING_BONUS_MAX, Number(event.target.value) || 0)))} /></label>
            {!validNumber(bonusPerOpponent, 0, TIENLEN_SCORING_BONUS_MAX) ? <p className="modal-error">Nhập số nguyên từ 0 đến 50.</p> : null}
            {([
              ['dragon', 'Sảnh rồng'], ['four_twos', 'Tứ quý 2'], ['six_pairs', '6 đôi'],
              ['five_pairs_run', '5 đôi thông'], ['four_threes', 'Tứ quý 3'],
            ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={whiteTypes[key]}
              onChange={(event) => setWhiteTypes((current) => ({ ...current, [key]: event.target.checked }))} /> {label}</label>)}
          </> : null}
        </details>
        <details><summary>Cóng/ngộp</summary>
          <label><input type="checkbox" checked={coldEnabled} onChange={(event) => setColdEnabled(event.target.checked)} /> Bật cóng/ngộp</label>
          {coldEnabled ? <label className="create-rule-row"><span>Điểm phạt</span><input className="modal-field create-number" type="number" min={TIENLEN_SCORING_VALUE_MIN} max={0} value={coldPenalty}
            onChange={(event) => setColdPenalty(Number(event.target.value) || 0)} /></label> : null}
          {!validNumber(coldPenalty, TIENLEN_SCORING_VALUE_MIN, 0) ? <p className="modal-error">Nhập số nguyên từ -50 đến 0.</p> : null}
        </details>
        <details><summary>Thối heo</summary>
          <label><input type="checkbox" checked={rottenEnabled} onChange={(event) => setRottenEnabled(event.target.checked)} /> Bật thối heo</label>
        </details>
      </div> : <div className="create-columns">
        <div className="create-column">
          <div><span className="modal-label">{t('lobby.create.players')}</span><div className="chip-row">
            {PLAYER_OPTIONS.filter((count) => count >= game.minPlayers && count <= game.maxPlayers).map((count) =>
              <button key={count} type="button" className="chip" aria-pressed={maxPlayers === count} onClick={() => setMaxPlayers(count)}>{t('lobby.create.people', { count })}</button>)}
          </div></div>
          {gameType !== 'tienlen' || scoringMode === 'coins' ? <div><span className="modal-label">{t('lobby.create.stake')}</span><div className="chip-row">
            {game.betLevels.map((value) => <button key={value} type="button" className="chip" aria-pressed={stake === value} onClick={() => setStake(value)}>{formatChips(value)}</button>)}
          </div>{poor ? <p className="modal-error">{t('lobby.create.min', { amount: formatChips(minBalanceFor(stake)) })}</p> : null}</div> : null}
          <div><span className="modal-label">{t('lobby.create.visibility')}</span><div className="chip-row">
            <button type="button" className="chip" aria-pressed={isPublic} onClick={() => setIsPublic(true)}>{t('lobby.create.public')}</button>
            <button type="button" className="chip" aria-pressed={!isPublic} onClick={() => setIsPublic(false)}>{t('lobby.create.private')}</button>
          </div></div>
          <div><label className="modal-label" htmlFor="create-password">{t('lobby.create.password')}</label>
            <input id="create-password" className="modal-field" type="password" autoComplete="new-password" maxLength={PASSWORD_MAX}
              value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
        </div>
        <div className="create-column">
          {gameType === 'tienlen' ? <>
            <div><span className="modal-label">Chế độ</span><div className="chip-row">
              <button type="button" className="chip" aria-pressed={scoringMode === 'points'} onClick={() => setScoringMode('points')}>Tính điểm</button>
              <button type="button" className="chip" aria-pressed={scoringMode === 'coins'} onClick={() => setScoringMode('coins')}>Tính xu</button>
            </div></div>
            {scoringMode === 'points' ? <div><span className="modal-label">Điểm đích</span>
              <div className="create-stepper"><button type="button" className="chip" aria-label="Giảm điểm đích" onClick={() => setTarget(targetScore - 5)}>−</button>
                <output>{targetScore}</output><button type="button" className="chip" aria-label="Tăng điểm đích" onClick={() => setTarget(targetScore + 5)}>+</button></div>
              <div className="chip-row">{[...TIENLEN_SCORING_TARGETS, 100].map((value) => <button key={value} type="button" className="chip"
                aria-pressed={targetScore === value} onClick={() => setTarget(value)}>{value}</button>)}</div>
              <button type="button" className="create-custom" onClick={() => {
                if (showTargetInput && !targetValid) setTarget(targetScore);
                setShowTargetInput((value) => !value);
              }}>Nhập số khác</button>
              {showTargetInput ? <div><label className="modal-label" htmlFor="target-score">Điểm đích khác (5–200)</label>
                <input id="target-score" className="modal-field" type="text" inputMode="numeric" pattern="[0-9]*" value={targetInput}
                  aria-invalid={!targetValid} onChange={(event) => {
                    const value = event.target.value;
                    setTargetInput(value);
                    if (/^[0-9]+$/.test(value) && Number(value) >= TIENLEN_SCORING_TARGET_MIN && Number(value) <= TIENLEN_SCORING_TARGET_MAX) setTargetScore(Number(value));
                  }} />
                {!targetValid ? <p className="modal-error">Nhập số nguyên từ 5 đến 200.</p> : null}
              </div> : null}
            </div> : null}
            <button type="button" className="btn" onClick={() => setShowScoring(true)}>Luật chi tiết ▸</button>
            {!rulesValid ? <p className="modal-error">Kiểm tra các giá trị trong luật chi tiết.</p> : null}
          </> : null}
          <button type="button" className="btn" disabled={busy} onClick={onReturnToTable}>{t('lobby.returnToTable')}</button>
        </div>
      </div>}
    </Modal>
  );
}
