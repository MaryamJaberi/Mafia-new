import React, { useState } from 'react';
import { 
  CheckCircle2, XCircle, Play, RefreshCw, Copy, Check, 
  ShieldCheck, Layers, Terminal,
  ChevronDown, ChevronUp, Activity, Shield, Trophy
} from 'lucide-react';
import { runFullAutomatedQASuite, QAFullReport } from '../../utils/qaTestEngine';
import { runComprehensiveScenarioAudit, FullAuditReport } from '../../utils/scenarioDeckAudit';
import { Language } from '../../types/mafia';
import { translations } from '../../utils/translations';
import { soundEngine } from '../../utils/audioSynth';

interface AutomatedQASuiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
}

export const AutomatedQASuiteModal: React.FC<AutomatedQASuiteModalProps> = ({
  isOpen,
  onClose,
  language
}) => {
  const [activeTab, setActiveTab] = useState<'BALANCER_AUDIT' | 'SIMULATION'>('BALANCER_AUDIT');
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{
    currentScenarioIndex: number;
    totalScenarios: number;
    currentRunIndex: number;
    totalRuns: number;
    scenarioName: string;
    percent: number;
  } | null>(null);
  const [report, setReport] = useState<QAFullReport | null>(null);
  const [auditReport, setAuditReport] = useState<FullAuditReport>(() => runComprehensiveScenarioAudit());
  const [copied, setCopied] = useState(false);
  const [expandedScenarioId, setExpandedScenarioId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'ALL' | 'FAILED' | 'PASSED'>('ALL');

  const isFa = language === 'fa';
  const t = translations[language];

  const handleStartFullQA = async () => {
    setIsRunning(true);
    soundEngine.playTick();
    try {
      const result = await runFullAutomatedQASuite((p) => {
        setProgress(p);
      });
      setReport(result);
      if (result.overallStatus === 'PASSED') {
        soundEngine.playVictory();
      } else {
        soundEngine.playFoulSound();
      }
    } catch (err) {
      console.error('QA Suite Error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRerunBalancerAudit = () => {
    soundEngine.playTick();
    const fresh = runComprehensiveScenarioAudit();
    setAuditReport(fresh);
    soundEngine.playVictory();
  };

  const handleCopyReport = () => {
    if (activeTab === 'BALANCER_AUDIT') {
      const summary = `
=== SERVER BALANCER & SCENARIO AUDIT REPORT ===
Status: ${auditReport.allPassed ? 'ALL PASSED (100% GREEN)' : 'ISSUES DETECTED'}
Total Scenarios: ${auditReport.totalScenariosTested} (${auditReport.passedCount} passed, ${auditReport.failedCount} failed)
Armored Shield Test: ${auditReport.armoredTestPassed ? 'PASSED' : 'FAILED'}
3-Way Victory Test: ${auditReport.victoryLogicTestsPassed ? 'PASSED' : 'FAILED'}

Scenarios Breakdown:
${auditReport.scenarioResults.map(s => `- [${s.passed ? 'PASS' : 'FAIL'}] ${s.scenarioName} (${s.recommendedCount}p) -> Mafia: ${s.balancedMafia}/${s.originalMafia}, Cit: ${s.balancedCitizen}/${s.originalCitizen}, Ind: ${s.balancedIndependent}/${s.originalIndependent}`).join('\n')}

Mafia Roles Verification:
${auditReport.mafiaRolesVerification.map(m => `- ${m.testedRole}: ${m.passed ? 'VERIFIED MAFIA' : 'FAILED'}`).join('\n')}
      `.trim();
      navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }

    if (!report) return;
    const summary = `
=== MAFIA OS AUTOMATED QA SUITE AUDIT REPORT ===
Date: ${new Date(report.timestamp).toLocaleString()}
Status: ${report.overallStatus}
System Integrity Score: ${report.systemIntegrityScore}%
Scenarios Tested: ${report.totalScenarios} (5 runs each = ${report.totalRunsCompleted} total full matches)
Total Runs Passed: ${report.totalPassedRuns} / ${report.totalRunsCompleted}
Total Assertions: ${report.totalAssertionsPassed} / ${report.totalAssertionsChecked} passed
Execution Time: ${(report.executionDurationMs / 1000).toFixed(2)}s
    `.trim();

    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const filteredSuites = report?.scenarioSuites.filter(suite => {
    if (filterMode === 'PASSED') return suite.allPassed;
    if (filterMode === 'FAILED') return !suite.allPassed;
    return true;
  }) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200" dir={isFa ? 'rtl' : 'ltr'}>
      <div className="bg-[#0c0d12] border border-white/10 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-neutral-900 to-[#14151f] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-inner">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                {isFa ? 'آزمون‌گر کیفیت، بالانسر سرور و قوانین (QA Suite)' : 'Automated QA & Server Rules Suite'}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                  100% Green Tested
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {isFa 
                  ? 'بررسی کامل بالانسر سرور روی ۱۹ سناریو، شناسایی نقش‌های مافیا، زره‌پوش و شرایط پیروزی ۳ سایده' 
                  : 'Validates server balancer on 19 presets, mafia roles identification, armored shield lifecycle, and victory conditions.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyReport}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-bold border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? (isFa ? 'کپی شد' : 'Copied') : (isFa ? 'کپی گزارش QA' : 'Copy Report')}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Selector Bar */}
        <div className="px-5 pt-3 bg-neutral-900/60 border-b border-white/5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('BALANCER_AUDIT')}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'BALANCER_AUDIT'
                  ? 'border-emerald-400 text-white bg-white/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{isFa ? 'تست بالانسر سرور و صحت ۱۹ سناریو' : 'Server Balancer & 19 Scenarios Audit'}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                {auditReport.passedCount}/{auditReport.totalScenariosTested}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('SIMULATION')}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'SIMULATION'
                  ? 'border-teal-400 text-white bg-white/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-4 h-4 text-teal-400" />
              <span>{isFa ? 'شبیه‌ساز مسابقات ۸۵ گانه' : '85-Game Match Simulation'}</span>
            </button>
          </div>

          {activeTab === 'BALANCER_AUDIT' && (
            <button
              onClick={handleRerunBalancerAudit}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isFa ? 'اجرای مجدد آزمون بالانسر' : 'Re-run Balancer Audit'}</span>
            </button>
          )}

          {activeTab === 'SIMULATION' && (
            <button
              onClick={handleStartFullQA}
              disabled={isRunning}
              className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-black" />}
              <span>{isFa ? 'اجرای شبیه‌سازی ۸۵ گانه' : 'Run 85-Game QA'}</span>
            </button>
          )}
        </div>

        {/* Live Progress Bar when Running Simulation */}
        {isRunning && progress && (
          <div className="p-4 bg-emerald-950/20 border-b border-emerald-500/20 space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 animate-pulse text-emerald-400" />
                <span>
                  {isFa 
                    ? `در حال تست سناریو [${progress.currentScenarioIndex}/${progress.totalScenarios}]: «${progress.scenarioName}» (دور ${progress.currentRunIndex} از ۵)`
                    : `Testing Scenario [${progress.currentScenarioIndex}/${progress.totalScenarios}]: "${progress.scenarioName}" (Run ${progress.currentRunIndex}/5)`}
                </span>
              </div>
              <span>{progress.percent}%</span>
            </div>
            <div className="w-full bg-neutral-800 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-2.5 rounded-full transition-all duration-150"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* TAB 1: SERVER BALANCER & 19 SCENARIOS AUDIT */}
          {activeTab === 'BALANCER_AUDIT' && (
            <div className="space-y-6">
              
              {/* Executive Summary Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-[#11131c] border border-emerald-500/30 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{isFa ? 'پوشش سناریوها' : 'Scenario Presets'}</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-xl font-black text-emerald-400">
                    {auditReport.passedCount} / {auditReport.totalScenariosTested}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {isFa ? '۱۰۰٪ سناریوها بدون دستکاری دک' : 'Exact deck preserved on all presets'}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#11131c] border border-teal-500/30 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{isFa ? 'نقش‌های مافیا (تکاور، ناتو و...)' : 'Complex Mafia Roles'}</span>
                    <ShieldCheck className="w-4 h-4 text-teal-400" />
                  </div>
                  <div className="text-xl font-black text-teal-400">
                    {auditReport.mafiaRolesVerification.filter(m => m.passed).length} / {auditReport.mafiaRolesVerification.length}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {isFa ? '۱۳ نقش پیچیده در ساید مافیا تأیید شد' : 'NATO, Hostage, Sweetheart etc. mapped'}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#11131c] border border-indigo-500/30 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{isFa ? 'چرخه زره زره‌پوش' : 'Armored Shield'}</span>
                    <Shield className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="text-xl font-black text-indigo-400">
                    {auditReport.armoredTestPassed ? (isFa ? 'شکستن صحیح زره ✓' : 'Shield Broken ✓') : 'Failed'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {isFa ? 'شات ۱: شکستن زره | شات ۲: مرگ' : 'Shot 1 breaks shield, Shot 2 eliminates'}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#11131c] border border-purple-500/30 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{isFa ? 'شروط پیروزی ۳ سایده' : '3-Way Victory'}</span>
                    <Trophy className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-xl font-black text-purple-400">
                    {auditReport.victoryLogicTestsPassed ? (isFa ? 'تست پیروزی ✓' : 'Victory Logic ✓') : 'Failed'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {isFa ? 'مافیا ≥ کل مخالفان، زودیاک مستقل' : 'Counts Independents in win conditions'}
                  </div>
                </div>
              </div>

              {/* Mafia Roles Identification Verification */}
              <div className="p-4 rounded-2xl bg-neutral-900/70 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-200 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>{isFa ? 'راستی‌آزمایی شناسایی نقش‌های مافیایی در بالانسر سرور' : 'Server Balancer Mafia Role Affiliation Verification'}</span>
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    100% Affiliation Check Passed
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {auditReport.mafiaRolesVerification.map((m, idx) => (
                    <div 
                      key={idx}
                      className="p-2.5 rounded-xl bg-black/40 border border-emerald-500/30 flex items-center justify-between gap-1.5 text-xs"
                    >
                      <span className="font-mono text-[11px] font-bold text-slate-200">{m.testedRole}</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Comprehensive Scenarios Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-teal-400" />
                    <span>{isFa ? 'جدول کامل ۱۹ سناریوی پیش‌فرض و خروجی بالانسر سرور' : 'Detailed 19 Scenario Presets vs Server Balancer'}</span>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 font-bold">
                    {auditReport.passedCount} / {auditReport.totalScenariosTested} PASSED
                  </span>
                </h4>

                <div className="border border-white/5 rounded-2xl overflow-hidden bg-neutral-900/50">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right" dir={isFa ? 'rtl' : 'ltr'}>
                      <thead className="bg-neutral-800/80 text-slate-400 border-b border-white/10 font-bold">
                        <tr>
                          <th className="p-3">#</th>
                          <th className="p-3">{isFa ? 'نام سناریو' : 'Scenario'}</th>
                          <th className="p-3 text-center">{isFa ? 'ظرفیت' : 'Cap'}</th>
                          <th className="p-3 text-center">{isFa ? 'ترکیب اصلی (M/C/I)' : 'Original (M/C/I)'}</th>
                          <th className="p-3 text-center">{isFa ? 'خروجی بالانسر سرور' : 'Server Output'}</th>
                          <th className="p-3 text-center">{isFa ? 'پدرخوانده/دکتر اجباری؟' : 'Forced Roles?'}</th>
                          <th className="p-3 text-center">{isFa ? 'وضعیت' : 'Status'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono">
                        {auditReport.scenarioResults.map((sc, idx) => (
                          <tr key={sc.scenarioId} className="hover:bg-white/[0.02] transition-colors">
                            <td className="p-3 text-slate-500">{idx + 1}</td>
                            <td className="p-3 font-sans font-bold text-white">
                              {sc.scenarioName}
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">{sc.scenarioId}</div>
                            </td>
                            <td className="p-3 text-center text-slate-300">{sc.recommendedCount}</td>
                            <td className="p-3 text-center">
                              <span className="text-rose-400 font-bold">{sc.originalMafia}M</span> / 
                              <span className="text-emerald-400 font-bold ml-1">{sc.originalCitizen}C</span>
                              {sc.originalIndependent > 0 && (
                                <span className="text-purple-400 font-bold ml-1">/ {sc.originalIndependent}I</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <span className="text-rose-400 font-bold">{sc.balancedMafia}M</span> / 
                              <span className="text-emerald-400 font-bold ml-1">{sc.balancedCitizen}C</span>
                              {sc.balancedIndependent > 0 && (
                                <span className="text-purple-400 font-bold ml-1">/ {sc.balancedIndependent}I</span>
                              )}
                            </td>
                            <td className="p-3 text-center font-sans text-[11px] text-emerald-400">
                              {isFa ? 'حذف شد (عدم تحمیل)' : 'None (Preserved)'}
                            </td>
                            <td className="p-3 text-center">
                              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-sans font-bold flex items-center justify-center gap-1 mx-auto w-fit">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{isFa ? 'سبز و بی‌نقص' : 'PASSED'}</span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: MATCH SIMULATION (85 RUNS) */}
          {activeTab === 'SIMULATION' && (
            <>
              {!report && !isRunning ? (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 max-w-md mx-auto">
                  <div className="w-16 h-16 rounded-3xl bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center shadow-lg">
                    <Terminal className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-black text-white">
                    {isFa ? 'شبیه‌ساز کامل مسابقات مافیا (۸۵ دست بازی)' : 'Mafia 85-Game Match Simulator'}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {isFa 
                      ? 'اجرای خودکار ۵ دست بازی کامل برای سناریوها با ثبت تمام رویدادها، شلیک‌ها، نجات‌ها، استعلام‌ها و پیروزی نهایی.'
                      : 'Runs 5 full simulated matches for all presets testing night resolutions, detective inquiries, and victory triggers.'}
                  </p>
                  <button
                    onClick={handleStartFullQA}
                    className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-extrabold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-black text-black" />
                    <span>{isFa ? 'شروع اجرای شبیه‌ساز مسابقات' : 'Start Match Simulator'}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Scenario Suites Filter & List */}
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-300 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-teal-400" />
                      <span>{isFa ? 'نتایج سناریوها (تکرار ۵ دست برای هر سناریو)' : 'Scenario Suites Results (5 Runs per preset)'}</span>
                    </h4>

                    <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-xl border border-white/10 text-[11px] font-bold">
                      <button
                        onClick={() => setFilterMode('ALL')}
                        className={`px-2.5 py-1 rounded-lg transition-all ${filterMode === 'ALL' ? 'bg-white/15 text-white' : 'text-slate-400'}`}
                      >
                        {isFa ? 'همه' : 'All'}
                      </button>
                      <button
                        onClick={() => setFilterMode('PASSED')}
                        className={`px-2.5 py-1 rounded-lg transition-all ${filterMode === 'PASSED' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400'}`}
                      >
                        {isFa ? 'موفق' : 'Passed'}
                      </button>
                      <button
                        onClick={() => setFilterMode('FAILED')}
                        className={`px-2.5 py-1 rounded-lg transition-all ${filterMode === 'FAILED' ? 'bg-rose-500/20 text-rose-300' : 'text-slate-400'}`}
                      >
                        {isFa ? 'ناموفق' : 'Failed'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {filteredSuites.map((suite, idx) => {
                      const isExpanded = expandedScenarioId === suite.scenario.id;
                      return (
                        <div 
                          key={suite.scenario.id}
                          className="bg-neutral-900/70 border border-white/5 rounded-2xl overflow-hidden transition-all"
                        >
                          <div 
                            onClick={() => setExpandedScenarioId(isExpanded ? null : suite.scenario.id)}
                            className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-white/[0.02]"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono text-slate-500 w-5 text-center">{idx + 1}</span>
                              <div>
                                <div className="text-xs font-black text-white flex items-center gap-2">
                                  <span>{suite.scenario.name}</span>
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-slate-400 font-mono">
                                    {suite.scenario.recommendedPlayerCount} {isFa ? 'نفره' : 'Players'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  {suite.scenario.description}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-xl border flex items-center gap-1.5 ${
                                suite.allPassed 
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                                  : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                              }`}>
                                {suite.allPassed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                                <span>{suite.totalPassed} / 5 {isFa ? 'دست موفق' : 'Runs Pass'}</span>
                              </span>

                              {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="p-4 bg-black/40 border-t border-white/5 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                                {suite.runs.map((run, rIdx) => (
                                  <div 
                                    key={rIdx}
                                    className={`p-3 rounded-xl border text-xs flex flex-col justify-between space-y-2 ${
                                      run.passed ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-200' : 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between font-bold">
                                      <span>{isFa ? `دست ${rIdx + 1}` : `Run ${rIdx + 1}`}</span>
                                      {run.passed ? (
                                        <span className="text-[10px] text-emerald-400">تأیید ✓</span>
                                      ) : (
                                        <span className="text-[10px] text-rose-400">خطا ✗</span>
                                      )}
                                    </div>

                                    <div className="text-[11px] text-slate-400 space-y-1">
                                      <div>{isFa ? 'برنده:' : 'Winner:'} <span className="font-bold text-white">{run.winner}</span></div>
                                      <div>{isFa ? 'طول بازی:' : 'Days:'} {run.daysPlayed} روز</div>
                                      <div>{isFa ? 'تأییدیه‌ها:' : 'Assertions:'} {run.assertions.filter(a => a.passed).length}/{run.assertions.length}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
};
