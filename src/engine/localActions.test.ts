// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Player, RoomState } from '../types/mafia';
import {
  LOCAL_ACTION_TYPES, applyLocalAction, computeWinner, isLocalAction, shuffle, voteThreshold,
} from './localActions';

const ROLES = ['GODFATHER', 'DOCTOR_LECTER', 'MAFIA_SIMPLE', 'DOCTOR', 'DETECTIVE', 'SNIPER', 'ARMORED', 'CITIZEN_SIMPLE', 'CITIZEN_SIMPLE', 'CITIZEN_SIMPLE'];

function makeRoom(roles: string[] = ROLES): RoomState {
  const players: Player[] = roles.map((role, i) => ({
    id: `p${i + 1}`, name: `بازیکن ${i + 1}`, avatar: '🕵️', role, isAlive: true,
    isConnected: true, isHost: false, seatNumber: i + 1, fouls: 0,
  }));
  return {
    roomId: 'MAFIA-TEST', scenarioId: 'classic-10', hostToken: 'h', joinToken: 'j', isLobbyLocked: false,
    phase: 'NIGHT', dayNumber: 1, timerSeconds: 60, timerTotal: 60, isTimerRunning: false,
    players, accusations: [], nightActions: [], votes: [], announcements: [], createdAt: 0, updatedAt: 0,
  };
}
const ctx = { language: 'fa' as const, now: () => 1000, random: () => 0.42 };

test('every action the UI dispatches is known to the local engine', () => {
  const dispatched = [
    'ADD_ACCUSATION', 'ADD_MANUAL_PLAYER', 'ADD_SINGLE_PLAYER', 'CHANGE_ROLE', 'CLEAR_DEFENSE', 'CLOSE_VOTING',
    'CONVERT_TO_BOT', 'DEAL_ROLES', 'DISTRIBUTE_ROLES', 'ELIMINATE_PLAYER', 'KICK_PLAYER', 'KILL_PLAYER',
    'LOCK_LOBBY', 'MUTE_SPEECH', 'PUBLISH_CHRONICLE', 'RECORD_FOUL', 'REMOVE_FOUL', 'RENAME_PLAYER', 'REPLAY_SET',
    'RESOLVE_NIGHT', 'RESOLVE_VOTING_TIE', 'REVIVE_PLAYER', 'SEND_TO_DEFENSE', 'SET_DECK', 'SET_PHASE',
    'SET_PLAYERS', 'SHUFFLE_TABLE', 'START_GAME', 'START_SPEAKER_TIMER', 'START_VOTING', 'STOP_SPEAKER_TIMER',
    'SUBMIT_VOTE', 'SUBMIT_VOTE_MANUAL', 'TIMER_CONTROL', 'UPDATE_HOUSE_RULES', 'UPDATE_MEETING_LINK',
    'UPDATE_PLAYERS', 'UPDATE_SCENARIO',
  ];
  for (const a of dispatched) assert.ok(isLocalAction(a), `${a} is not handled`);
  assert.equal(new Set(LOCAL_ACTION_TYPES).size, LOCAL_ACTION_TYPES.length, 'duplicate action name');
});

test('the engine never mutates the previous room', () => {
  const room = makeRoom();
  const frozen = JSON.stringify(room);
  applyLocalAction(room, 'RESOLVE_NIGHT', { deadPlayerIds: ['p8'], mutedPlayerId: 'p9', narrative: 'x' }, ctx);
  assert.equal(JSON.stringify(room), frozen);
});

test('RESOLVE_NIGHT kills, silences, logs privately and opens the next day', () => {
  const next = applyLocalAction(makeRoom(), 'RESOLVE_NIGHT', {
    deadPlayerIds: ['p8'], mutedPlayerId: 'p9', narrative: 'بازیکن 8 با شلیک مافیا کشته شد.',
  }, ctx);
  assert.equal(next.players.find(p => p.id === 'p8')!.isAlive, false);
  assert.equal(next.players.find(p => p.id === 'p9')!.isMuted, true);
  assert.equal(next.phase, 'DAY_DISCUSSION');
  assert.equal(next.dayNumber, 2);
  const publicAnn = next.announcements.find(a => a.isPublic)!;
  assert.match(publicAnn.content, /بازیکن 8/);
  assert.doesNotMatch(publicAnn.content, /شلیک مافیا/, 'the public morning text must not reveal the cause');
  const hostLog = next.announcements.find(a => !a.isPublic)!;
  assert.match(hostLog.content, /شلیک مافیا/);
});

test('a quiet night changes nobody and yesterday\'s silence is lifted', () => {
  const room = makeRoom();
  room.players[4].isMuted = true;
  const next = applyLocalAction(room, 'RESOLVE_NIGHT', { deadPlayerIds: [] }, ctx);
  assert.equal(next.players.filter(p => p.isAlive).length, 10);
  assert.equal(next.players[4].isMuted, false);
  assert.match(next.announcements[0].content, /کسی از بازی خارج نشد/);
});

test('the armoured vest absorbs one shot only', () => {
  const next = applyLocalAction(makeRoom(), 'RESOLVE_NIGHT', { deadPlayerIds: [], brokenShieldPlayerIds: ['p7'] }, ctx);
  const armored = next.players.find(p => p.id === 'p7')!;
  assert.equal(armored.isAlive, true);
  assert.equal(armored.hasShield, false);
});

test('intro night resolves into day 1, not day 2', () => {
  const room = makeRoom();
  room.phase = 'INTRO_NIGHT';
  const next = applyLocalAction(room, 'RESOLVE_NIGHT', { deadPlayerIds: [] }, ctx);
  assert.equal(next.phase, 'DAY_DISCUSSION');
  assert.equal(next.dayNumber, 1);
});

test('defence and elimination flow', () => {
  let room = makeRoom();
  room.phase = 'DAY_VOTING';
  room = applyLocalAction(room, 'SEND_TO_DEFENSE', { playerId: 'p3' }, ctx);
  room = applyLocalAction(room, 'SEND_TO_DEFENSE', { playerId: 'p3' }, ctx);
  assert.deepEqual(room.activeDefensePlayers, ['p3']);
  assert.equal(room.players[2].inDefense, true);
  room = applyLocalAction(room, 'ELIMINATE_PLAYER', { playerId: 'p3' }, ctx);
  assert.equal(room.players[2].isAlive, false);
  assert.equal(room.players[2].inDefense, false);
  assert.deepEqual(room.activeDefensePlayers, []);
  assert.equal(room.announcements[0].type, 'DEATH');
  room = applyLocalAction(room, 'SEND_TO_DEFENSE', { playerId: 'p4' }, ctx);
  room = applyLocalAction(room, 'CLEAR_DEFENSE', {}, ctx);
  assert.equal(room.players.some(p => p.inDefense), false);
});

test('voting: threshold is half of the other living players, rounded down', () => {
  let room = makeRoom();
  assert.equal(voteThreshold(room.players), 4);
  room = applyLocalAction(room, 'START_VOTING', { targetPlayerId: 'p2', stage: 'DEFENSE_ENTRY' }, ctx);
  room = applyLocalAction(room, 'SUBMIT_VOTE_MANUAL', { count: 3 }, ctx);
  room = applyLocalAction(room, 'CLOSE_VOTING', {}, ctx);
  assert.equal(room.players[1].inDefense ?? false, false, '3 votes are below the threshold of 4');
  room = applyLocalAction(room, 'START_VOTING', { targetPlayerId: 'p2', stage: 'DEFENSE_ENTRY' }, ctx);
  room = applyLocalAction(room, 'SUBMIT_VOTE_MANUAL', { count: 4 }, ctx);
  room = applyLocalAction(room, 'CLOSE_VOTING', {}, ctx);
  assert.equal(room.players[1].inDefense, true);
  assert.equal(room.votingState!.isOpen, false);
});

test('dealing keeps the deck composition and resets confirmations', () => {
  let room = makeRoom(Array(10).fill('CITIZEN_SIMPLE'));
  room = applyLocalAction(room, 'SET_DECK', { deckRoles: ROLES.map((roleId, i) => ({ id: `d${i}`, roleId })) }, ctx);
  room = applyLocalAction(room, 'DISTRIBUTE_ROLES', {}, ctx);
  assert.deepEqual(room.players.map(p => p.role).sort(), [...ROLES].sort());
  assert.equal(room.rolesDistributed, true);
  const started = applyLocalAction(room, 'START_GAME', {}, ctx);
  assert.deepEqual(started.players.map(p => p.role), room.players.map(p => p.role), 'START_GAME must not re-deal dealt cards');
  assert.equal(started.phase, 'DAY_DISCUSSION');
});

test('shuffle is a permutation and SHUFFLE_TABLE renumbers seats 1..n', () => {
  assert.deepEqual(shuffle([1, 2, 3, 4, 5], () => 0.3).sort(), [1, 2, 3, 4, 5]);
  const room = applyLocalAction(makeRoom(), 'SHUFFLE_TABLE', {}, ctx);
  assert.deepEqual(room.players.map(p => p.seatNumber), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(room.players.map(p => p.id)).size, 10);
});

test('fouls are capped at 4 and never go below 0', () => {
  let room = makeRoom();
  for (let i = 0; i < 6; i++) room = applyLocalAction(room, 'RECORD_FOUL', { playerId: 'p1' }, ctx);
  assert.equal(room.players[0].fouls, 4);
  for (let i = 0; i < 6; i++) room = applyLocalAction(room, 'REMOVE_FOUL', { playerId: 'p1' }, ctx);
  assert.equal(room.players[0].fouls, 0);
});

test('win conditions', () => {
  const room = makeRoom();
  assert.equal(computeWinner(room.players), null);
  const noMafia = room.players.map(p => (['p1', 'p2', 'p3'].includes(p.id) ? { ...p, isAlive: false } : p));
  assert.equal(computeWinner(noMafia), 'CITIZEN');
  const parity = room.players.map(p => (['p4', 'p5', 'p6', 'p7'].includes(p.id) ? { ...p, isAlive: false } : p));
  assert.equal(computeWinner(parity), 'MAFIA', '3 mafia against 3 citizens is a mafia win');
  const withIndependent = [...noMafia, { ...room.players[0], id: 'z', role: 'ZODIAC', isAlive: true }];
  assert.equal(computeWinner(withIndependent), null, 'a living independent keeps the game open');
});

test('END_GAME records the winner; unknown actions change nothing', () => {
  const ended = applyLocalAction(makeRoom(), 'END_GAME', { winner: 'MAFIA' }, ctx);
  assert.equal(ended.phase, 'GAME_OVER');
  assert.equal(ended.winner, 'MAFIA');
  const room = makeRoom();
  assert.deepEqual(applyLocalAction(room, 'NOT_A_REAL_ACTION', {}, ctx), room);
});
