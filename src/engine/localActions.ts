// Local (offline / static-hosting) game engine.
//
// On GitHub Pages there is no Express backend, so every host action has to be
// applied on the device itself. This module is the single pure function that does
// that: (room, action, payload) -> new room. It has no React, no fetch and no
// global state, so it can be unit-tested with `npm test`.
//
// It mirrors the action names of the server (`server.ts`, POST /api/rooms/:id/action)
// and adds the host-flow actions the UI dispatches but the server never implemented
// (RESOLVE_NIGHT, ELIMINATE_PLAYER, SEND_TO_DEFENSE, CLEAR_DEFENSE).

import type {
  Accusation,
  DeckRoleItem,
  GameAnnouncement,
  GamePhase,
  Language,
  Player,
  RoleAffiliation,
  RoleId,
  RoomState,
} from '../types/mafia';
import { DEFAULT_SCENARIOS, ROLE_DEFINITIONS, balanceScenarioRoles } from '../utils/scenarios';

export interface LocalActionContext {
  language?: Language;
  /** Injectable clock and randomness so tests are deterministic. */
  now?: () => number;
  random?: () => number;
}

/** Every action type this engine understands. Anything else is reported, not silently dropped. */
export const LOCAL_ACTION_TYPES = [
  'SET_PHASE', 'TIMER_CONTROL', 'KILL_PLAYER', 'REVIVE_PLAYER', 'ADD_ACCUSATION', 'CHANGE_ROLE',
  'RENAME_PLAYER', 'KICK_PLAYER', 'ADD_SINGLE_PLAYER', 'ADD_MANUAL_PLAYER', 'LOCK_LOBBY',
  'UPDATE_SCENARIO', 'REPLAY_SET', 'UPDATE_PLAYERS', 'SET_PLAYERS', 'UPDATE_HOUSE_RULES',
  'PUBLISH_CHRONICLE', 'DEAL_ROLES', 'DISTRIBUTE_ROLES', 'SET_DECK', 'SHUFFLE_TABLE',
  'RESOLVE_VOTING_TIE', 'REVEAL_AND_CONFIRM_ROLE', 'CONVERT_TO_BOT', 'START_GAME', 'END_GAME',
  'RESOLVE_NIGHT', 'ELIMINATE_PLAYER', 'SEND_TO_DEFENSE', 'CLEAR_DEFENSE', 'RECORD_FOUL',
  'REMOVE_FOUL', 'MUTE_SPEECH', 'START_SPEAKER_TIMER', 'STOP_SPEAKER_TIMER', 'TICK_SPEAKER_TIMER',
  'SET_TIMER_SETTINGS', 'START_VOTING', 'SUBMIT_VOTE_MANUAL', 'SUBMIT_VOTE', 'CLOSE_VOTING',
  'UPDATE_MEETING_LINK', 'POST_ANNOUNCEMENT', 'RECORD_NIGHT_ACTION', 'SET_SPEAKING_START_SEAT',
] as const;

export type LocalActionType = (typeof LOCAL_ACTION_TYPES)[number];

export function isLocalAction(actionType: string): actionType is LocalActionType {
  return (LOCAL_ACTION_TYPES as readonly string[]).includes(actionType);
}

/** Unbiased Fisher–Yates shuffle (the old `sort(() => Math.random() - 0.5)` is not uniform). */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function affiliationOf(player: Pick<Player, 'role' | 'customRoleAffiliation'>): RoleAffiliation {
  return player.customRoleAffiliation || ROLE_DEFINITIONS[player.role]?.affiliation || 'CITIZEN';
}

/**
 * Classic win check on the living players.
 * - CITIZEN: no mafia left and no living independent.
 * - MAFIA: living mafia >= all other living players.
 * - null: the game goes on (or an independent is still alive and the host must judge).
 */
export function computeWinner(players: readonly Player[]): RoleAffiliation | null {
  const alive = players.filter(p => p.isAlive);
  if (alive.length === 0) return null;
  const mafia = alive.filter(p => affiliationOf(p) === 'MAFIA').length;
  const independent = alive.filter(p => affiliationOf(p) === 'INDEPENDENT').length;
  const others = alive.length - mafia;
  if (mafia === 0) return independent === 0 ? 'CITIZEN' : null;
  if (mafia >= others) return 'MAFIA';
  return null;
}

/** Votes needed to send a player to defence / out: half of the other living players, rounded down. */
export function voteThreshold(players: readonly Player[]): number {
  const living = players.filter(p => p.isAlive).length;
  return Math.floor((living - 1) / 2);
}

function announce(
  room: RoomState,
  now: number,
  title: string,
  content: string,
  type: GameAnnouncement['type'] = 'INFO',
): void {
  room.announcements = room.announcements || [];
  room.announcements.unshift({
    id: `ann_${now}_${room.announcements.length}`,
    title,
    content,
    phase: room.phase,
    dayNumber: room.dayNumber,
    timestamp: now,
    isPublic: true,
    type,
  });
}

function dealRoles(room: RoomState, random: () => number): void {
  const deck = (room.deckRoles || []) as DeckRoleItem[];
  const fallback = DEFAULT_SCENARIOS.find(s => s.id === room.scenarioId)?.roles
    || DEFAULT_SCENARIOS[0]?.roles
    || [];
  const baseRoles: RoleId[] = deck.length > 0 ? deck.map(d => d.roleId) : fallback;
  const balanced = balanceScenarioRoles(baseRoles, room.players.length, room.scenarioId);

  // Keep a custom name/affiliation attached to its own card while shuffling.
  const cards = balanced.map((roleId, idx) => {
    const card = deck[idx] && deck[idx].roleId === roleId ? deck[idx] : undefined;
    return { roleId, customName: card?.customName, customAffiliation: card?.customAffiliation };
  });
  const shuffled = shuffle(cards, random);

  room.players = room.players.map((p, idx) => {
    const card = shuffled[idx];
    const next: Player = {
      ...p,
      role: card?.roleId || p.role || 'CITIZEN_SIMPLE',
      roleRevealedAndConfirmed: false,
    };
    if (card?.customName) next.customRoleName = card.customName; else delete next.customRoleName;
    if (card?.customAffiliation) next.customRoleAffiliation = card.customAffiliation; else delete next.customRoleAffiliation;
    return next;
  });
  room.rolesDistributed = true;
}

function eliminate(room: RoomState, playerId: string, now: number, fa: boolean, reason: 'VOTE' | 'HOST' | 'NIGHT'): void {
  const p = room.players.find(x => x.id === playerId);
  if (!p || !p.isAlive) return;
  p.isAlive = false;
  p.inDefense = false;
  room.activeDefensePlayers = (room.activeDefensePlayers || []).filter(id => id !== playerId);
  if (reason !== 'NIGHT') {
    announce(
      room, now,
      fa ? 'حذف از بازی' : 'Eliminated',
      fa ? `${p.name} از بازی خارج شد.` : `${p.name} left the game.`,
      'DEATH',
    );
  }
}

/**
 * Apply one host/player action to a room and return the new room.
 * Never mutates `prev`. Unknown actions return an untouched copy.
 */
export function applyLocalAction(
  prev: RoomState,
  actionType: string,
  payload: Record<string, unknown> = {},
  ctx: LocalActionContext = {},
): RoomState {
  const now = (ctx.now || Date.now)();
  const random = ctx.random || Math.random;
  const fa = (ctx.language || 'fa') !== 'en';
  const copy: RoomState = JSON.parse(JSON.stringify(prev));
  const findPlayer = (id: unknown) => copy.players.find(x => x.id === id);

  switch (actionType) {
    case 'SET_PHASE': {
      copy.phase = (payload.phase as GamePhase) || copy.phase;
      if (typeof payload.dayNumber === 'number') copy.dayNumber = payload.dayNumber;
      break;
    }
    case 'TIMER_CONTROL': {
      copy.timerSeconds = payload.seconds as number;
      copy.timerTotal = payload.total as number;
      copy.isTimerRunning = payload.isRunning as boolean;
      break;
    }
    case 'KILL_PLAYER': {
      eliminate(copy, payload.playerId as string, now, fa, 'HOST');
      break;
    }
    case 'ELIMINATE_PLAYER': {
      eliminate(copy, payload.playerId as string, now, fa, 'VOTE');
      break;
    }
    case 'REVIVE_PLAYER': {
      const p = findPlayer(payload.playerId);
      if (p) p.isAlive = true;
      break;
    }
    case 'SEND_TO_DEFENSE': {
      const p = findPlayer(payload.playerId);
      if (p && p.isAlive) {
        p.inDefense = true;
        const list = copy.activeDefensePlayers || [];
        if (!list.includes(p.id)) list.push(p.id);
        copy.activeDefensePlayers = list;
        if (copy.votingState && !copy.votingState.defenseCandidates.includes(p.id)) {
          copy.votingState.defenseCandidates.push(p.id);
        }
      }
      break;
    }
    case 'CLEAR_DEFENSE': {
      copy.players.forEach(p => { p.inDefense = false; p.votesReceived = 0; });
      copy.activeDefensePlayers = [];
      if (copy.votingState) {
        copy.votingState.defenseCandidates = [];
        copy.votingState.votes = {};
        copy.votingState.manualCount = 0;
        copy.votingState.isOpen = false;
      }
      break;
    }
    case 'RESOLVE_NIGHT': {
      const deadIds = Array.isArray(payload.deadPlayerIds) ? (payload.deadPlayerIds as string[]) : [];
      const brokenShieldIds = Array.isArray(payload.brokenShieldPlayerIds) ? (payload.brokenShieldPlayerIds as string[]) : [];
      const mutedId = typeof payload.mutedPlayerId === 'string' ? payload.mutedPlayerId : '';
      const narrative = typeof payload.narrative === 'string' ? payload.narrative.trim() : '';
      const night = copy.dayNumber;

      // Yesterday's silence ends; tonight's silence starts.
      copy.players.forEach(p => { p.isMuted = false; });
      const names: string[] = [];
      deadIds.forEach(id => {
        const p = findPlayer(id);
        if (p && p.isAlive) names.push(p.name);
        eliminate(copy, id, now, fa, 'NIGHT');
      });
      brokenShieldIds.forEach(id => {
        const p = findPlayer(id);
        if (p) p.hasShield = false;
      });
      const muted = findPlayer(mutedId);
      if (muted && muted.isAlive) muted.isMuted = true;

      // Private host log: what actually happened (never shown to players).
      if (narrative) {
        copy.announcements.unshift({
          id: `ann_${now}_night_log`,
          title: fa ? `گزارش محرمانهٔ شب ${night}` : `Night ${night} host log`,
          content: narrative,
          phase: 'NIGHT',
          dayNumber: night,
          timestamp: now,
          isPublic: false,
          type: 'CHRONICLE',
        });
      }

      // Night N is followed by day N+1 (the first night after day 1 opens day 2).
      // The intro night is the exception: it is followed by day 1.
      const wasIntroNight = copy.phase === 'INTRO_NIGHT';
      copy.phase = 'DAY_DISCUSSION';
      copy.dayNumber = wasIntroNight ? night : night + 1;

      // Public morning announcement: only who left, never why.
      const publicText = names.length === 0
        ? (fa ? 'شب آرام سپری شد و کسی از بازی خارج نشد.' : 'A quiet night: nobody left the game.')
        : (fa ? `دیشب ${names.join(' و ')} از بازی خارج شد${names.length > 1 ? 'ند' : ''}.` : `Last night ${names.join(' and ')} left the game.`);
      announce(copy, now, fa ? `صبح روز ${copy.dayNumber}` : `Morning of day ${copy.dayNumber}`, publicText, names.length ? 'DEATH' : 'INFO');
      break;
    }
    case 'ADD_ACCUSATION': {
      const acc: Accusation = {
        id: `acc_${now}_${Math.floor(random() * 1e6).toString(36)}`,
        accuserId: payload.accuserId as string,
        targetId: payload.targetId as string,
        dayNumber: copy.dayNumber,
        phase: copy.phase,
        timestamp: now,
      };
      copy.accusations.push(acc);
      break;
    }
    case 'CHANGE_ROLE': {
      const p = findPlayer(payload.playerId);
      if (p) p.role = payload.role as RoleId;
      break;
    }
    case 'RENAME_PLAYER': {
      const p = findPlayer(payload.playerId);
      const name = typeof payload.newName === 'string' ? payload.newName.trim().slice(0, 30) : '';
      if (p && name) p.name = name;
      break;
    }
    case 'KICK_PLAYER': {
      copy.players = copy.players.filter(x => x.id !== payload.playerId);
      break;
    }
    case 'ADD_SINGLE_PLAYER':
    case 'ADD_MANUAL_PLAYER': {
      const name = (typeof payload.name === 'string' && payload.name.trim().length > 0)
        ? payload.name.trim().slice(0, 30)
        : `${fa ? 'بازیکن' : 'Player'} ${copy.players.length + 1}`;
      const taken = new Set(copy.players.map(p => p.seatNumber).filter(Boolean));
      let seat = typeof payload.seatNumber === 'number' ? payload.seatNumber : copy.players.length + 1;
      while (taken.has(seat)) seat++;
      copy.players.push({
        id: `p_${now}_${Math.floor(random() * 1e8).toString(36)}`,
        name,
        avatar: (typeof payload.avatar === 'string' && payload.avatar) ? payload.avatar : '🕵️‍♂️',
        role: (typeof payload.role === 'string' && payload.role) ? payload.role : 'CITIZEN_SIMPLE',
        isAlive: true,
        isConnected: true,
        isReady: true,
        isHost: false,
        joinedAt: now,
        seatNumber: seat,
        fouls: 0,
      });
      break;
    }
    case 'LOCK_LOBBY': {
      copy.isLobbyLocked = payload.locked as boolean;
      break;
    }
    case 'UPDATE_SCENARIO': {
      copy.scenarioId = payload.scenarioId as string;
      break;
    }
    case 'REPLAY_SET': {
      if (Array.isArray(payload.players)) {
        copy.players = (payload.players as Player[]).map((p, idx) => ({
          ...p,
          isAlive: true,
          isConnected: true,
          isReady: true,
          inDefense: false,
          isMuted: false,
          fouls: 0,
          seatNumber: p.seatNumber || idx + 1,
        }));
      }
      if (payload.scenarioId) copy.scenarioId = payload.scenarioId as string;
      copy.phase = (payload.phase as GamePhase) || 'LOBBY';
      copy.dayNumber = 1;
      copy.accusations = [];
      copy.nightActions = [];
      copy.votes = [];
      copy.winner = null;
      copy.activeDefensePlayers = [];
      delete copy.votingState;
      break;
    }
    case 'UPDATE_PLAYERS':
    case 'SET_PLAYERS': {
      if (Array.isArray(payload.players)) copy.players = payload.players as Player[];
      break;
    }
    case 'UPDATE_HOUSE_RULES': {
      copy.houseRules = payload.rules as RoomState['houseRules'];
      break;
    }
    case 'PUBLISH_CHRONICLE': {
      copy.morningChronicle = payload.text as string;
      break;
    }
    case 'SET_DECK': {
      if (Array.isArray(payload.deckRoles)) copy.deckRoles = payload.deckRoles as DeckRoleItem[];
      break;
    }
    case 'SHUFFLE_TABLE': {
      copy.players = shuffle(copy.players, random).map((p, idx) => ({ ...p, seatNumber: idx + 1 }));
      copy.tableShuffled = true;
      announce(
        copy, now,
        fa ? 'بر زدن صندلی‌ها (شافل میز)' : 'Table shuffled',
        fa ? 'صندلی‌های دور میز شافل شد. لطفاً بازیکنان به صندلی‌های جدید خود منتقل شوند.' : 'Seats were shuffled. Please move to your new seat.',
      );
      break;
    }
    case 'DEAL_ROLES':
    case 'DISTRIBUTE_ROLES': {
      dealRoles(copy, random);
      announce(
        copy, now,
        fa ? 'توزیع کارت‌های نقش' : 'Role cards dealt',
        fa ? `کارت‌های نقش برای ${copy.players.length} بازیکن توزیع شد.` : `Role cards were dealt to ${copy.players.length} players.`,
      );
      break;
    }
    case 'START_GAME': {
      // Roles already dealt at the table stay as they are; otherwise deal now.
      if (!copy.rolesDistributed) dealRoles(copy, random);
      copy.players.forEach(p => { p.isAlive = true; p.inDefense = false; p.isMuted = false; });
      copy.phase = 'DAY_DISCUSSION';
      copy.dayNumber = 1;
      copy.winner = null;
      copy.gameStartedAt = now;
      announce(
        copy, now,
        fa ? 'بازی آغاز شد!' : 'Game started!',
        fa ? 'نقش‌ها تعیین شد و بازی به طور رسمی آغاز گردید. موفق باشید!' : 'Roles are set and the game has officially begun. Good luck!',
      );
      break;
    }
    case 'END_GAME': {
      copy.phase = 'GAME_OVER';
      copy.winner = (payload.winner as RoomState['winner']) || computeWinner(copy.players) || 'DRAW';
      copy.gameEndedAt = now;
      const who = copy.winner === 'CITIZEN' ? (fa ? 'شهروندان' : 'the citizens')
        : copy.winner === 'MAFIA' ? (fa ? 'تیم مافیا' : 'the mafia')
        : copy.winner === 'INDEPENDENT' ? (fa ? 'مستقل' : 'the independent')
        : (fa ? 'هیچ‌کس (مساوی)' : 'nobody (draw)');
      announce(copy, now, fa ? 'پایان بازی!' : 'Game over!', fa ? `بازی با پیروزی ${who} به پایان رسید!` : `The game ended with a win for ${who}!`, 'VICTORY');
      break;
    }
    case 'RESOLVE_VOTING_TIE': {
      const resolution = payload.resolution as string;
      const candidateIds = (payload.candidateIds as string[]) || [];
      const candidates = copy.players.filter(p => candidateIds.includes(p.id));
      if (resolution === 'REVOTE') {
        copy.votes = [];
        if (copy.votingState) {
          copy.votingState.votes = {};
          copy.votingState.manualCount = 0;
          copy.votingState.defenseCandidates = candidateIds;
          copy.votingState.stage = 'EXIT_VOTE';
        }
      } else if (resolution === 'NO_ELIMINATION') {
        copy.activeDefensePlayers = [];
        copy.players.forEach(p => { if (candidateIds.includes(p.id)) p.inDefense = false; });
        if (copy.votingState) copy.votingState.isOpen = false;
      } else if (resolution === 'RANDOM_DRAW') {
        if (candidates.length > 0) {
          const unlucky = candidates[Math.floor(random() * candidates.length)];
          eliminate(copy, unlucky.id, now, fa, 'VOTE');
        }
      } else if (resolution === 'ELIMINATE_BOTH') {
        candidates.forEach(c => eliminate(copy, c.id, now, fa, 'VOTE'));
      }
      break;
    }
    case 'REVEAL_AND_CONFIRM_ROLE': {
      const p = findPlayer(payload.playerId);
      if (p) p.roleRevealedAndConfirmed = true;
      break;
    }
    case 'CONVERT_TO_BOT': {
      const p = findPlayer(payload.playerId);
      if (p) {
        p.isBot = true;
        if (!p.name.includes('🤖')) p.name = `🤖 ${p.name}`;
      }
      break;
    }
    case 'RECORD_FOUL': {
      const p = findPlayer(payload.playerId);
      if (p) {
        p.fouls = Math.min((p.fouls || 0) + 1, 4);
        announce(
          copy, now,
          fa ? 'ثبت خطا (فول)' : 'Foul recorded',
          fa ? `برای ${p.name} خطای شماره ${p.fouls} ثبت شد.` : `Foul #${p.fouls} recorded for ${p.name}.`,
          'WARNING',
        );
      }
      break;
    }
    case 'REMOVE_FOUL': {
      const p = findPlayer(payload.playerId);
      if (p && (p.fouls || 0) > 0) p.fouls = (p.fouls || 0) - 1;
      break;
    }
    case 'MUTE_SPEECH': {
      const p = findPlayer(payload.playerId);
      if (p) p.speechMuted = typeof payload.speechMuted === 'boolean' ? payload.speechMuted : !p.speechMuted;
      break;
    }
    case 'START_SPEAKER_TIMER': {
      copy.activeSpeakerId = payload.playerId as string;
      copy.activeSpeakerType = (payload.speakerType as RoomState['activeSpeakerType']) || 'SPEECH';
      copy.speakerTimeRemaining = (payload.seconds as number) || copy.defaultSpeechSeconds || 60;
      copy.speakerTimerTotal = copy.speakerTimeRemaining;
      copy.isSpeakerTimerRunning = true;
      break;
    }
    case 'STOP_SPEAKER_TIMER': {
      copy.isSpeakerTimerRunning = false;
      copy.activeSpeakerId = null;
      copy.activeSpeakerType = null;
      break;
    }
    case 'TICK_SPEAKER_TIMER': {
      if (typeof copy.speakerTimeRemaining === 'number' && copy.speakerTimeRemaining > 0) copy.speakerTimeRemaining -= 1;
      break;
    }
    case 'SET_TIMER_SETTINGS': {
      if (typeof payload.defaultSpeechSeconds === 'number') copy.defaultSpeechSeconds = payload.defaultSpeechSeconds;
      if (typeof payload.defaultChallengeSeconds === 'number') copy.defaultChallengeSeconds = payload.defaultChallengeSeconds;
      break;
    }
    case 'START_VOTING': {
      copy.votingState = {
        isOpen: true,
        stage: (payload.stage as 'DEFENSE_ENTRY' | 'EXIT_VOTE') || 'DEFENSE_ENTRY',
        targetPlayerId: (payload.targetPlayerId as string) || null,
        defenseCandidates: copy.votingState?.defenseCandidates || [],
        votes: {},
        manualCount: 0,
      };
      break;
    }
    case 'SUBMIT_VOTE_MANUAL': {
      if (copy.votingState) copy.votingState.manualCount = payload.count as number;
      break;
    }
    case 'SUBMIT_VOTE': {
      const voterId = payload.voterId as string | undefined;
      if (copy.votingState && copy.votingState.isOpen && voterId) {
        copy.votingState.votes[voterId] = payload.voteValue !== false;
      }
      break;
    }
    case 'CLOSE_VOTING': {
      const vs = copy.votingState;
      if (vs) {
        const target = findPlayer(vs.targetPlayerId);
        const threshold = voteThreshold(copy.players);
        let totalYes = Object.values(vs.votes || {}).filter(Boolean).length;
        if (typeof vs.manualCount === 'number' && vs.manualCount > 0) totalYes = vs.manualCount;
        if (vs.stage === 'DEFENSE_ENTRY' && target && totalYes >= threshold) {
          if (!vs.defenseCandidates.includes(target.id)) vs.defenseCandidates.push(target.id);
          target.inDefense = true;
          target.votesReceived = totalYes;
          const list = copy.activeDefensePlayers || [];
          if (!list.includes(target.id)) list.push(target.id);
          copy.activeDefensePlayers = list;
          announce(
            copy, now,
            fa ? 'ورود به دفاعیه' : 'Sent to defence',
            fa ? `${target.name} با کسب ${totalYes} رأی وارد جایگاه دفاعیه شد (حداقل حد نصاب: ${threshold}).`
               : `${target.name} goes to defence with ${totalYes} votes (threshold: ${threshold}).`,
          );
        }
        vs.isOpen = false;
      }
      break;
    }
    case 'UPDATE_MEETING_LINK': {
      if (typeof payload.meetingUrl === 'string') copy.meetingUrl = payload.meetingUrl;
      if (typeof payload.meetingPlatform === 'string') copy.meetingPlatform = payload.meetingPlatform as RoomState['meetingPlatform'];
      break;
    }
    case 'POST_ANNOUNCEMENT': {
      const a = payload.announcement as Partial<GameAnnouncement> | undefined;
      const title = (a?.title || payload.title) as string | undefined;
      const content = (a?.content || payload.content) as string | undefined;
      if (title || content) announce(copy, now, title || '', content || '', (a?.type || payload.type || 'INFO') as GameAnnouncement['type']);
      break;
    }
    case 'RECORD_NIGHT_ACTION': {
      if (payload.record && typeof payload.record === 'object') {
        copy.nightActions.push(payload.record as RoomState['nightActions'][number]);
      }
      break;
    }
    case 'SET_SPEAKING_START_SEAT': {
      if (typeof payload.seatNumber === 'number') copy.daySpeakingStartSeat = payload.seatNumber;
      break;
    }
    default:
      // Unknown action: leave the room untouched (the caller logs it).
      return copy;
  }

  copy.updatedAt = now;
  return copy;
}
