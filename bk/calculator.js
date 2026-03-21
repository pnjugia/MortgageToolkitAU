/* ============================================================
   MortgagePro — Enterprise Calculator JS
   Features: P&I, IO, Offset, Extra Repayments, Comparison,
             Stamp Duty (all states), Borrowing Power,
             Charts (Chart.js), CSV Export, Dark Mode, PDF Print
   ============================================================ */

'use strict';

// ─── State ───────────────────────────────────────────────────
let currentFrequency = 'monthly';
let balanceChartInstance = null;
let donutChartInstance = null;
let bpGaugeInstance = null;
let extraRepayChartInstance = null;
let ucDonutInstance = null;
let compBarChartInstance = null;
let compBalanceChartInstance = null;
let rw_scenarioChartInstance = null;
let rw_fvChartInstance       = null;
let rw_stressChartInstance   = null;
let comparisonLoans = [];
let lastResult = null;
const RBA_RATE = 4.10; // current RBA cash rate (2025) — kept for any legacy references

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initTabs();
    initSliders();
    initFrequencyButtons();
    initAdvancedToggle();
    initLoanTypeToggle();
    initFormListeners();
    buildComparisonGrid();
    initInvestorSliders();
    initPurchaseYearListeners();
    initBuyerTypeToggle();
    initBorrowingPowerListeners();
    initFHBStateListener();
    // Wire dep tab buttons
    document.querySelectorAll('.inv-dep-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.inv-dep-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (window._lastInvResult) renderDepreciationChart(window._lastInvResult, btn.dataset.dep);
        });
    });
    setTimeout(() => calculateMortgage(true), 50);
});

// ─── Theme ────────────────────────────────────────────────────
function initTheme() {
    const saved = localStorage.getItem('mp-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    document.getElementById('themeToggle').addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('mp-theme', next);
        // Redraw all charts that depend on theme colours
        if (lastResult) renderCharts(lastResult);
        if (window._lastInvResult) {
            renderInvPLChart(window._lastInvResult);
            renderDepreciationChart(window._lastInvResult, document.querySelector('.inv-dep-tab.active')?.dataset.dep || 'both');
            renderEquityChart(window._lastInvResult);
        }
        if (comparisonLoans.length > 0) renderCompCharts(comparisonLoans.map(calcLoan));
        if (rw_lastResult) { renderRWScenarioChart(rw_lastResult); renderRWFVChart(rw_lastResult); renderRWStressChart(rw_lastResult); }
    });
}

// ─── Tabs ─────────────────────────────────────────────────────
function initTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const id = tab.dataset.tab;
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + id).classList.add('active');
        });
    });
}

// ─── Sliders ──────────────────────────────────────────────────
function initSliders() {
    const ppInput = document.getElementById('propertyPrice');
    const ppSlider = document.getElementById('propertyPriceSlider');
    const depInput = document.getElementById('deposit');
    const depSlider = document.getElementById('depositSlider');
    const termInput = document.getElementById('loanTerm');
    const termSlider = document.getElementById('loanTermSlider');

    const syncSlider = (input, slider) => {
        if (slider) { slider.value = input.value; updateSliderFill(slider); }
    };
    const syncInput = (slider, input) => {
        input.value = slider.value;
        input.dispatchEvent(new Event('input'));
    };

    ppInput.addEventListener('input', () => syncSlider(ppInput, ppSlider));
    ppSlider.addEventListener('input', () => syncInput(ppSlider, ppInput));
    depInput.addEventListener('input', () => syncSlider(depInput, depSlider));
    depSlider.addEventListener('input', () => syncInput(depSlider, depInput));
    if (termInput && termSlider) {
        termInput.addEventListener('input', () => {
            syncSlider(termInput, termSlider);
            document.getElementById('termBadge').textContent = termInput.value + ' yrs';
        });
        termSlider.addEventListener('input', () => syncInput(termSlider, termInput));
    }

    document.querySelectorAll('.range-slider').forEach(s => {
        s.addEventListener('input', () => updateSliderFill(s));
        updateSliderFill(s);
    });
}

function updateSliderFill(slider) {
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const val = parseFloat(slider.value) || 0;
    const pct = ((val - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, var(--emerald) 0%, var(--emerald) ${pct}%, var(--border) ${pct}%, var(--border) 100%)`;

    // Loan term badge
    if (slider.id === 'loanTermSlider') {
        document.getElementById('termBadge').textContent = slider.value + ' yrs';
    }
}

// ─── Frequency Select ─────────────────────────────────────────
function initFrequencyButtons() {
    const sel = document.getElementById('repaymentFrequency');
    if (sel) {
        sel.addEventListener('change', () => {
            currentFrequency = sel.value;
            clearCustomRepayment();
        });
        currentFrequency = sel.value;
    }
    // Keep freq-btn support if present
    document.querySelectorAll('.freq-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.freq-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFrequency = btn.dataset.freq;
            clearCustomRepayment();
        });
    });
}

// ─── Advanced Panel ───────────────────────────────────────────
function initAdvancedToggle() {
    const trigger = document.getElementById('advancedToggle');
    const panel = document.getElementById('advancedPanel');
    const chevron = trigger.querySelector('.chevron');
    trigger.addEventListener('click', () => {
        const open = !panel.classList.contains('collapsed');
        panel.classList.toggle('collapsed', open);
        chevron.classList.toggle('open', !open);
    });
}

// ─── Loan Type Toggle ─────────────────────────────────────────
function initLoanTypeToggle() {
    // Support original checkbox id="interestOnly"
    const ioCheck = document.getElementById('interestOnly');
    if (ioCheck) {
        ioCheck.addEventListener('change', () => {
            const isIO = ioCheck.checked;
            const ioTermGroup = document.getElementById('ioTermGroup');
            if (ioTermGroup) ioTermGroup.classList.toggle('hidden', !isIO);
            clearCustomRepayment();
        });
    }
    // Also support radio buttons if present
    document.querySelectorAll('[name="loanType"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const isIO = document.getElementById('loanTypeIO') && document.getElementById('loanTypeIO').checked;
            const ioTermGroup = document.getElementById('ioTermGroup');
            if (ioTermGroup) ioTermGroup.classList.toggle('hidden', !isIO);
            clearCustomRepayment();
        });
    });
}

// ─── Form Listeners ───────────────────────────────────────────
function initFormListeners() {
    document.getElementById('mortgageForm').addEventListener('submit', e => {
        e.preventDefault();
        calculateMortgage();
    });

    const priceInputs = ['propertyPrice', 'deposit'];
    priceInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            updateLoanAmount();
            clearCustomRepayment();
        });
    });

    ['interestRate', 'loanTerm', 'offsetAccount', 'extraRepayment'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', clearCustomRepayment);
    });

    // Live deposit % badge
    ['propertyPrice', 'deposit'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateDepositBadge);
    });

    // Sync deposit → loan amount on upfront costs tab
    const sdPrice   = document.getElementById('sdPrice');
    const sdDeposit = document.getElementById('sdDeposit');
    const sdLoan    = document.getElementById('sdLoanAmount');
    const syncUCLoan = () => {
        const p = parseFloat(sdPrice?.value) || 0;
        const d = parseFloat(sdDeposit?.value) || 0;
        if (sdLoan) sdLoan.value = Math.max(0, p - d);
    };
    if (sdPrice)   sdPrice.addEventListener('input', syncUCLoan);
    if (sdDeposit) sdDeposit.addEventListener('input', syncUCLoan);

    // Extra repayment frequency hint
    const freqEl = document.getElementById('repaymentFrequency');
    const updateExtraHint = () => {
        const hint = document.getElementById('extraRepayHint');
        if (!hint || !freqEl) return;
        const freqWord = freqEl.value === 'weekly' ? 'week' : freqEl.value === 'fortnightly' ? 'fortnight' : 'month';
        hint.textContent = 'per ' + freqWord + ' — on top of your minimum repayment';
    };
    if (freqEl) freqEl.addEventListener('change', updateExtraHint);

    // IO term slider <-> number input sync
    const ioTermSlider = document.getElementById('ioTermSlider');
    const ioTermInput  = document.getElementById('ioTerm');
    const ioTermBadge  = document.getElementById('ioTermBadge');
    if (ioTermSlider && ioTermInput) {
        ioTermSlider.addEventListener('input', () => {
            ioTermInput.value = ioTermSlider.value;
            if (ioTermBadge) ioTermBadge.textContent = ioTermSlider.value + ' yrs';
            updateSliderFill(ioTermSlider);
        });
        ioTermInput.addEventListener('input', () => {
            ioTermSlider.value = ioTermInput.value;
            if (ioTermBadge) ioTermBadge.textContent = ioTermInput.value + ' yrs';
            updateSliderFill(ioTermSlider);
        });
        updateSliderFill(ioTermSlider);
    }

    // Chart toggles
    document.querySelectorAll('.chart-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.chart-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (lastResult) renderBalanceChart(lastResult, btn.dataset.mode);
        });
    });
}

function updateLoanAmount() {
    const pp   = parseFloat(document.getElementById('propertyPrice').value) || 0;
    const dep  = parseFloat(document.getElementById('deposit').value) || 0;
    const loan = Math.max(0, pp - dep);
    document.getElementById('loanAmount').value = loan;
    updateLVRIndicator(pp, loan);
    updateDepositBadge();

    // Live equity hint
    const eqHint = document.getElementById('equityHint');
    if (eqHint && pp > 0) {
        const pct = (dep / pp * 100).toFixed(1);
        eqHint.textContent = 'Equity: ' + new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(dep) + ' (' + pct + '% of property)';
    } else if (eqHint) {
        eqHint.textContent = '';
    }

    // Keep deposit slider capped at property price
    const depSlider = document.getElementById('depositSlider');
    if (depSlider) {
        depSlider.max = pp > 0 ? pp : 1000000;
        updateSliderFill(depSlider);
    }
}

function updateDepositBadge() {
    const pp = parseFloat(document.getElementById('propertyPrice').value) || 1;
    const dep = parseFloat(document.getElementById('deposit').value) || 0;
    const pct = (dep / pp * 100).toFixed(1);
    document.getElementById('depositPctBadge').textContent = pct + '%';
}

function updateLVRIndicator(pp, loan) {
    if (!pp) return;
    const lvr = (loan / pp * 100).toFixed(0);
    const el = document.getElementById('lvrIndicator');
    el.textContent = 'LVR ' + lvr + '%';
    el.classList.toggle('warn', lvr > 80);
    document.getElementById('lmiNotice').classList.toggle('hidden', lvr <= 80);
}

function clearCustomRepayment() {
    document.getElementById('customRepayment').value = '';
}

function resetCalculator() {
    // Reset all form fields to defaults
    const defaults = {
        propertyPrice:  750000,
        deposit:        150000,
        loanAmount:     600000,
        interestRate:   6.29,
        loanTerm:       30,
        customRepayment: '',
        offsetAccount:  0,
        extraRepayment: 0,
        ioTerm:         5,
    };
    Object.entries(defaults).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    });

    // Reset selects
    const freqEl = document.getElementById('repaymentFrequency');
    if (freqEl) freqEl.value = 'monthly';

    // Uncheck Interest Only
    const ioCheck = document.getElementById('interestOnly');
    if (ioCheck) { ioCheck.checked = false; document.getElementById('ioTermGroup')?.classList.add('hidden'); }

    // Sync sliders
    const ppSlider = document.getElementById('propertyPriceSlider');
    if (ppSlider) { ppSlider.value = 750000; updateSliderFill(ppSlider); }
    const depSlider = document.getElementById('depositSlider');
    if (depSlider) { depSlider.value = 150000; depSlider.max = 750000; updateSliderFill(depSlider); }
    const termSlider = document.getElementById('loanTermSlider');
    if (termSlider) { termSlider.value = 30; updateSliderFill(termSlider); }
    const ioSlider = document.getElementById('ioTermSlider');
    if (ioSlider) { ioSlider.value = 5; updateSliderFill(ioSlider); }

    // Update live badges and indicators
    updateLoanAmount();
    updateDepositBadge();
    document.getElementById('termBadge').textContent = '30 yrs';
    document.getElementById('ioTermBadge').textContent = '5 yrs';

    // Hide results, show empty state
    document.getElementById('results').classList.add('hidden');
    document.getElementById('emptyState').style.display = '';

    // Clear rate tag
    const rateTag = document.getElementById('rateComparison');
    if (rateTag) { rateTag.textContent = ''; rateTag.className = 'rate-tag'; }
    const rateHint = document.getElementById('rateHint');
    if (rateHint) rateHint.style.display = 'none';

    // Spin the reset icon briefly
    const resetBtn = document.querySelector('.calc-reset-btn svg');
    if (resetBtn) {
        resetBtn.style.transition = 'transform 0.5s ease';
        resetBtn.style.transform  = 'rotate(-360deg)';
        setTimeout(() => { resetBtn.style.transition = ''; resetBtn.style.transform = ''; }, 550);
    }
}

// ─── Validation ───────────────────────────────────────────────
function validateForm() {
    // Clear all previous errors first
    document.querySelectorAll('.field-error').forEach(e => e.remove());
    document.querySelectorAll('.input-error').forEach(e => e.classList.remove('input-error'));

    const rules = [
        { id: 'propertyPrice', label: 'Property Price', min: 1 },
        { id: 'deposit',       label: 'Deposit',        min: 0 },
        { id: 'interestRate',  label: 'Interest Rate',  min: 0.01, max: 20 },
        { id: 'loanTerm',      label: 'Loan Term',      min: 1, max: 40 },
    ];
    let valid = true;

    rules.forEach(rule => {
        const el = document.getElementById(rule.id);
        const val = parseFloat(el.value);
        const wrap = el.closest('.input-wrap') || el.parentElement;

        let msg = '';
        if (el.value.trim() === '' || isNaN(val)) msg = rule.label + ' is required';
        else if (rule.min !== undefined && val < rule.min) msg = rule.label + ' must be at least ' + rule.min;
        else if (rule.max !== undefined && val > rule.max) msg = rule.label + ' cannot exceed ' + rule.max;

        if (msg) {
            valid = false;
            el.classList.add('input-error');
            const err = document.createElement('span');
            err.className = 'field-error';
            err.textContent = msg;
            // Insert after the wrap (or after the input's form-group container)
            const target = el.closest('.form-group') || wrap;
            target.appendChild(err);
        }
    });

    // Deposit cannot exceed property price
    const pp = parseFloat(document.getElementById('propertyPrice').value) || 0;
    const dep = parseFloat(document.getElementById('deposit').value) || 0;
    if (dep > pp && pp > 0) {
        const el = document.getElementById('deposit');
        el.classList.add('input-error');
        const err = document.createElement('span');
        err.className = 'field-error';
        err.textContent = 'Deposit cannot exceed the property price';
        const target = el.closest('.form-group') || el.parentElement;
        target.appendChild(err);
        valid = false;
    }
    return valid;
}

// ─── Core Calculation ─────────────────────────────────────────
function calculateMortgage(skipValidation) {
    if (!skipValidation && !validateForm()) return;
    const propertyPrice = parseFloat(document.getElementById('propertyPrice').value) || 0;
    const deposit = parseFloat(document.getElementById('deposit').value) || 0;
    const loanAmount = parseFloat(document.getElementById('loanAmount').value) || 0;
    const annualRate = parseFloat(document.getElementById('interestRate').value) || 0;
    const loanTermYears = parseInt(document.getElementById('loanTerm').value) || 30;
    const customRepayment = parseFloat(document.getElementById('customRepayment').value) || 0;
    const offsetAccount = parseFloat(document.getElementById('offsetAccount').value) || 0;
    const extraRepayment = parseFloat(document.getElementById('extraRepayment').value) || 0;
    // Support both original checkbox and new radio buttons
    const ioCheck = document.getElementById('interestOnly');
    const ioRadio = document.getElementById('loanTypeIO');
    const isInterestOnly = ioCheck ? ioCheck.checked : (ioRadio ? ioRadio.checked : false);
    const ioTermYears = isInterestOnly ? (parseInt(document.getElementById('ioTerm').value) || 5) : 0;
    // Support both select and freq-buttons
    const freqSel = document.getElementById('repaymentFrequency');
    const freq = freqSel ? freqSel.value : currentFrequency;
    const periodsPerYear = freq === 'weekly' ? 52 : freq === 'fortnightly' ? 26 : 12;
    const totalPeriods = loanTermYears * periodsPerYear;
    const periodicRate = (annualRate / 100) / periodsPerYear;
    const effectiveLoan = Math.max(0, loanAmount - offsetAccount);
    const lvr = propertyPrice > 0 ? (loanAmount / propertyPrice) * 100 : 0;

    let repayment, totalInterest, totalRepayments, ioRepayment, ioAfterRepayment, ioTotalInterest;

    if (isInterestOnly) {
        const ioPeriods = ioTermYears * periodsPerYear;
        const piPeriods = (loanTermYears - ioTermYears) * periodsPerYear;
        const piRate = periodicRate;
        ioRepayment = effectiveLoan * periodicRate;
        if (piPeriods > 0 && piRate > 0) {
            ioAfterRepayment = loanAmount * (piRate * Math.pow(1 + piRate, piPeriods)) / (Math.pow(1 + piRate, piPeriods) - 1);
        } else {
            ioAfterRepayment = 0;
        }
        const ioInterestTotal = ioRepayment * ioPeriods;
        const piResult = piPeriods > 0 ? calcInterestWithOffset(loanAmount, periodicRate, ioAfterRepayment, piPeriods, 0) : { totalInterest: 0 };
        ioTotalInterest = ioInterestTotal + piResult.totalInterest;
        repayment = ioRepayment;
        totalInterest = ioTotalInterest;
        totalRepayments = loanAmount + totalInterest;
    } else {
        const calcRepayment = periodicRate > 0
            ? loanAmount * (periodicRate * Math.pow(1 + periodicRate, totalPeriods)) / (Math.pow(1 + periodicRate, totalPeriods) - 1)
            : loanAmount / totalPeriods;
        repayment = customRepayment > 0 ? customRepayment : calcRepayment;
        const effectivePayment = repayment + extraRepayment;
        const result = calcInterestWithOffset(loanAmount, periodicRate, effectivePayment, totalPeriods, offsetAccount);
        totalInterest = result.totalInterest;
        totalRepayments = loanAmount + totalInterest;
        ioRepayment = effectiveLoan * periodicRate;
        ioTotalInterest = ioRepayment * totalPeriods;
    }

    // Offset comparison
    const interestWithoutOffset = calcInterestWithOffset(loanAmount, periodicRate,
        periodicRate > 0 ? loanAmount * (periodicRate * Math.pow(1 + periodicRate, totalPeriods)) / (Math.pow(1 + periodicRate, totalPeriods) - 1) : loanAmount / totalPeriods,
        totalPeriods, 0).totalInterest;
    const interestWithOffset = offsetAccount > 0 ? totalInterest : interestWithoutOffset;
    const offsetSaved = Math.max(0, interestWithoutOffset - interestWithOffset);

    // Extra repayment savings
    let interestSaved = 0, periodsSaved = 0;
    if (extraRepayment > 0 && !isInterestOnly) {
        const baseResult = calcInterestWithOffset(loanAmount, periodicRate, repayment, totalPeriods, offsetAccount);
        const extraResult = calcInterestWithOffset(loanAmount, periodicRate, repayment + extraRepayment, totalPeriods, offsetAccount);
        interestSaved = baseResult.totalInterest - extraResult.totalInterest;
        periodsSaved = baseResult.actualPeriods - extraResult.actualPeriods;
    }

    const stampDuty = estimateStampDuty('NSW', propertyPrice);
    const lmi = estimateLMI(loanAmount, propertyPrice);
    const monthlyRate = (annualRate / 100) / 12;
    const monthlyPayment = !isInterestOnly && periodicRate > 0
        ? loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, loanTermYears * 12)) / (Math.pow(1 + monthlyRate, loanTermYears * 12) - 1)
        : loanAmount * monthlyRate;

    const result = {
        repayment, totalInterest, totalRepayments, lvr, deposit, propertyPrice,
        loanAmount, isInterestOnly, ioRepayment: ioRepayment || repayment,
        ioAfterRepayment: ioAfterRepayment || 0,
        ioTotalInterest: ioTotalInterest || totalInterest,
        offsetSaved, interestWithoutOffset, interestWithOffset,
        offsetAccount, extraRepayment, interestSaved, periodsSaved,
        periodsPerYear, freq, loanTermYears, periodicRate, monthlyRate, monthlyPayment,
        totalPeriods, stampDuty, lmi, annualRate, ioTermYears
    };

    lastResult = result;
    displayResults(result);
    generateSchedule(result);
    renderCharts(result);
}

function calcInterestWithOffset(principal, periodicRate, payment, totalPeriods, offset) {
    let balance = principal;
    let totalInterest = 0;
    let actualPeriods = 0;
    for (let i = 0; i < totalPeriods; i++) {
        const eff = Math.max(0, balance - offset);
        const interest = eff * periodicRate;
        const principal = payment - interest;
        totalInterest += interest;
        balance = Math.max(0, balance - principal);
        actualPeriods++;
        if (balance < 0.01) break;
    }
    return { totalInterest, actualPeriods };
}

// ─── Display Results ──────────────────────────────────────────
function displayResults(r) {
    const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const freqLabel  = r.freq === 'weekly' ? 'per week' : r.freq === 'fortnightly' ? 'per fortnight' : 'per month';
    const freqWord   = r.freq === 'weekly' ? 'week' : r.freq === 'fortnightly' ? 'fortnight' : 'month';

    // ── Payoff date: month + year ──────────────────────────────
    const now       = new Date();
    const payoffMonths = r.loanTermYears * 12;
    const payoffDate = new Date(now.getFullYear(), now.getMonth() + payoffMonths, 1);
    const payoffStr  = MONTH_ABBR[payoffDate.getMonth()] + ' ' + payoffDate.getFullYear();

    // ── Metrics strip ──────────────────────────────────────────
    document.getElementById('repaymentAmount').textContent    = fmt(r.repayment);
    document.getElementById('repaymentFreqLabel').textContent = freqLabel;
    document.getElementById('totalInterest').textContent      = fmt(r.totalInterest);
    document.getElementById('totalInterestPct').textContent   = ((r.totalInterest / r.loanAmount) * 100).toFixed(0) + '% of loan';
    document.getElementById('totalRepayments').textContent    = fmt(r.totalRepayments);
    document.getElementById('loanEndDate').textContent        = 'paid off ' + payoffStr;

    // ── Early payoff tile — lead with TIME saved ───────────────
    document.getElementById('earlyPayoffTile').style.display = r.extraRepayment > 0 ? '' : 'none';
    const extraSavedEl = document.getElementById('extraInterestSaved');
    if (extraSavedEl) extraSavedEl.textContent = fmt(r.interestSaved);
    const timeSavedEl = document.getElementById('timeSaved');
    if (timeSavedEl) {
        const yrs = Math.floor(r.periodsSaved / r.periodsPerYear);
        const rem = r.periodsSaved % r.periodsPerYear;
        const periodLabel = r.freq === 'weekly' ? 'wk' : r.freq === 'fortnightly' ? 'fn' : 'mo';
        timeSavedEl.textContent = r.periodsSaved > 0
            ? (yrs > 0 ? yrs + 'y ' : '') + (rem > 0 ? rem + periodLabel : '')
            : '< 1 mo';
    }

    // ── P&I card ───────────────────────────────────────────────
    document.getElementById('piCard').style.display = r.isInterestOnly ? 'none' : '';
    const piRepayLabel = document.getElementById('piRepayLabel');
    if (piRepayLabel) piRepayLabel.textContent = freqWord.charAt(0).toUpperCase() + freqWord.slice(1) + ' repayment';
    document.getElementById('piRepayment').textContent       = fmt(r.repayment);
    const annualCostEl = document.getElementById('piAnnualCost');
    if (annualCostEl) annualCostEl.textContent = fmt(r.repayment * r.periodsPerYear);
    document.getElementById('piTotalRepayments').textContent = fmt(r.totalRepayments);
    document.getElementById('piTotalInterest').textContent   = fmt(r.totalInterest);

    // ── IO card ────────────────────────────────────────────────
    document.getElementById('ioCard').style.display = r.isInterestOnly ? '' : 'none';
    const ioRepEl = document.getElementById('interestOnlyRepayment');
    const ioTotalEl = document.getElementById('totalInterestOnly');
    if (ioRepEl) ioRepEl.textContent = fmt(r.ioRepayment);
    if (ioTotalEl) ioTotalEl.textContent = fmt(r.ioTotalInterest);
    const ioAfterEl = document.getElementById('ioAfterRepaymentDisplay');
    if (ioAfterEl) ioAfterEl.textContent = r.ioAfterRepayment > 0 ? fmt(r.ioAfterRepayment) : '—';

    // ── Offset card ────────────────────────────────────────────
    document.getElementById('offsetCard').style.display = r.offsetAccount > 0 ? '' : 'none';
    document.getElementById('interestWithoutOffset').textContent = fmt(r.interestWithoutOffset);
    document.getElementById('interestWithOffset').textContent    = fmt(r.interestWithOffset);
    const savedEl = document.getElementById('interestSaved');
    if (savedEl) savedEl.textContent = fmt(r.offsetSaved);
    const offsetCardTitle  = document.getElementById('offsetCardTitle');
    const offsetWithoutLabel = document.getElementById('offsetWithoutLabel');
    const offsetWithLabel    = document.getElementById('offsetWithLabel');
    if (offsetCardTitle)   offsetCardTitle.textContent   = 'Offset Account Savings';
    if (offsetWithoutLabel) offsetWithoutLabel.textContent = 'Interest without offset';
    if (offsetWithLabel)   offsetWithLabel.textContent   = 'Interest with offset';

    // ── Loan details card ──────────────────────────────────────
    document.getElementById('lvr').textContent          = r.lvr.toFixed(1) + '%';
    document.getElementById('depositAmount').textContent = fmt(r.deposit);
    document.getElementById('stampDutyEst').textContent  = fmt(r.stampDuty);
    const payoffCardEl = document.getElementById('payoffDateCard');
    if (payoffCardEl) payoffCardEl.textContent = payoffStr;

    // ── LMI ───────────────────────────────────────────────────
    const lmiEl = document.getElementById('lmiEstimate');
    if (lmiEl) lmiEl.textContent = fmt(r.lmi);
    const lmiRow = document.getElementById('lmiRow');
    if (lmiRow) lmiRow.style.display = r.lmi > 0 ? '' : 'none';
    const lmiNotice = document.getElementById('lmiNotice');
    if (lmiNotice) {
        if (r.lmi > 0) {
            lmiNotice.innerHTML = '⚠️ LMI may apply — LVR ' + r.lvr.toFixed(1) + '%. Est. LMI: <strong>' + fmt(r.lmi) + '</strong>';
            lmiNotice.classList.remove('hidden');
        } else {
            lmiNotice.classList.add('hidden');
        }
    }

    // ── Equity hint under Loan Amount ─────────────────────────
    const eqHint = document.getElementById('equityHint');
    if (eqHint && r.propertyPrice > 0) {
        eqHint.textContent = 'Equity: ' + fmt(r.deposit) + ' (' + (r.deposit / r.propertyPrice * 100).toFixed(1) + '% of property)';
    }

    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('results').classList.remove('hidden');
}

// ─── Charts ───────────────────────────────────────────────────
function renderCharts(r) {
    renderDonutChart(r);
    renderBalanceChart(r, document.querySelector('.chart-toggle.active')?.dataset.mode || 'all');
    renderExtraRepayChart(r);
}

function renderDonutChart(r) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // Three slices: Deposit (your equity in), Loan Principal (bank's money), Interest (cost of borrowing)
    const colors = ['#2563EB', '#0A2540', '#E24B4A'];
    const data   = [r.deposit, r.loanAmount, r.totalInterest];
    const labels = ['Deposit', 'Principal', 'Interest'];
    const totalCash = r.deposit + r.totalRepayments; // true total outlay

    const legend = document.getElementById('donutLegend');
    legend.innerHTML = labels.map((l, i) => `
        <div class="donut-legend-item">
            <span class="legend-dot" style="background:${colors[i]}"></span>
            <span class="legend-label">${l}</span>
            <span class="legend-val">${fmt(data[i])}</span>
        </div>
    `).join('');

    const ctx = document.getElementById('breakdownChart');
    if (donutChartInstance) donutChartInstance.destroy();
    donutChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }] },
        options: {
            responsive: true, cutout: '68%',
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: {
                    label: c => ' ' + c.label + ': ' + fmt(c.raw) + ' (' + ((c.raw / (r.deposit + r.totalRepayments)) * 100).toFixed(1) + '% of total outlay)'
                }}
            },
            animation: { duration: 600, easing: 'easeInOutQuart' }
        }
    });
}

function renderBalanceChart(r, mode) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#8CA4BB' : '#8896A9';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    // Build yearly data points
    const now       = new Date();
    const startYear = now.getFullYear();
    const startMon  = now.getMonth();
    const MONS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const labels = [], balances = [], equity = [], cumInterest = [];
    let balance = r.loanAmount;
    let cumI = 0;
    for (let yr = 0; yr <= r.loanTermYears; yr++) {
        const calYear = startYear + yr;
        labels.push(yr === 0 ? MONS[startMon] + ' ' + startYear : String(calYear));
        balances.push(Math.max(0, Math.round(balance)));
        equity.push(Math.round(r.loanAmount - balance));
        cumInterest.push(Math.round(cumI));
        if (yr < r.loanTermYears) {
            for (let m = 0; m < 12; m++) {
                const eff = Math.max(0, balance - r.offsetAccount);
                const interest = eff * r.monthlyRate;
                const prin = r.monthlyPayment - interest;
                cumI += interest;
                balance = Math.max(0, balance - prin);
            }
        }
    }

    // Single-series dataset definitions
    const dBalance = {
        label: 'Loan Balance',
        data: balances,
        borderColor: '#0A2540',
        backgroundColor: isDark ? 'rgba(10,37,64,0.25)' : 'rgba(10,37,64,0.06)',
        fill: true, tension: 0.4, pointRadius: 2, pointBackgroundColor: '#0A2540',
        borderWidth: 2,
    };
    const dEquity = {
        label: 'Equity Built',
        data: equity,
        borderColor: '#00C896',
        backgroundColor: isDark ? 'rgba(0,200,150,0.18)' : 'rgba(0,200,150,0.08)',
        fill: true, tension: 0.4, pointRadius: 2, pointBackgroundColor: '#00C896',
        borderWidth: 2,
    };
    const dCumulative = {
        label: 'Cumulative Interest',
        data: cumInterest,
        borderColor: '#F5A623',
        backgroundColor: isDark ? 'rgba(245,166,35,0.18)' : 'rgba(245,166,35,0.06)',
        fill: true, tension: 0.4, pointRadius: 2, pointBackgroundColor: '#F5A623',
        borderWidth: 2,
        borderDash: [],
    };

    const isAll = mode === 'all';
    const chosenDatasets = isAll
        ? [dBalance, dEquity, dCumulative]
        : mode === 'balance'    ? [dBalance]
        : mode === 'equity'     ? [dEquity]
        : [dCumulative];

    const ctx = document.getElementById('balanceChart');
    if (balanceChartInstance) balanceChartInstance.destroy();
    balanceChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: chosenDatasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: isAll,
                    position: 'top',
                    labels: {
                        color: textColor,
                        font: { family: 'DM Sans', size: 12 },
                        boxWidth: 12,
                        padding: 18,
                        usePointStyle: true,
                        pointStyle: 'circle',
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: c => '  ' + c.dataset.label + ': ' + fmt(c.raw)
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: textColor, maxTicksLimit: 10, font: { family: 'DM Sans', size: 11 } },
                    grid: { color: gridColor }
                },
                y: {
                    ticks: {
                        color: textColor,
                        callback: v => '$' + (v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v),
                        font: { family: 'DM Sans', size: 11 }
                    },
                    grid: { color: gridColor }
                }
            },
            animation: { duration: 500 }
        }
    });
}

function renderExtraRepayChart(r) {
    const section = document.getElementById('extraRepaymentSection');
    if (!section) return;
    if (!r.extraRepayment || r.extraRepayment <= 0 || r.isInterestOnly) {
        section.style.display = 'none';
        return;
    }
    section.style.display = '';

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#8CA4BB' : '#8896A9';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    // Build two payoff curves: standard vs with extra repayments
    const stdLabels = [], stdBalances = [], extraBalances = [];
    let stdBal = r.loanAmount, extraBal = r.loanAmount;
    const stdPayment = r.monthlyPayment;
    const extraPayment = r.monthlyPayment + r.extraRepayment * (r.periodsPerYear / 12);
    const maxMonths = r.loanTermYears * 12;

    for (let m = 0; m <= maxMonths; m++) {
        if (m % 12 === 0 || stdBal <= 0 || extraBal <= 0) {
            stdLabels.push(m === 0 ? 'Now' : 'Yr ' + (m / 12));
            stdBalances.push(Math.max(0, Math.round(stdBal)));
            extraBalances.push(Math.max(0, Math.round(extraBal)));
        }
        // Standard
        const stdInt = Math.max(0, stdBal - r.offsetAccount) * r.monthlyRate;
        stdBal = Math.max(0, stdBal - Math.max(0, stdPayment - stdInt));
        // With extra
        const extraInt = Math.max(0, extraBal - r.offsetAccount) * r.monthlyRate;
        extraBal = Math.max(0, extraBal - Math.max(0, extraPayment - extraInt));
    }

    // Savings strip
    const strip = document.getElementById('extraSavingsStrip');
    if (strip) {
        strip.innerHTML =
            '<span class="esaving-pill">Interest saved: <strong>' + fmt(r.interestSaved) + '</strong></span>' +
            (r.periodsSaved > 0 ? '<span class="esaving-pill">Time saved: <strong>' +
                (Math.floor(r.periodsSaved / r.periodsPerYear) > 0 ? Math.floor(r.periodsSaved / r.periodsPerYear) + 'y ' : '') +
                (r.periodsSaved % r.periodsPerYear > 0 ? r.periodsSaved % r.periodsPerYear + 'mo' : '') +
            '</strong></span>' : '');
    }

    const ctx = document.getElementById('extraRepayChart');
    if (extraRepayChartInstance) extraRepayChartInstance.destroy();
    extraRepayChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: stdLabels,
            datasets: [
                {
                    label: 'Standard',
                    data: stdBalances,
                    borderColor: '#8896A9',
                    backgroundColor: 'rgba(136,150,169,0.08)',
                    fill: true, tension: 0.4, pointRadius: 2,
                    borderDash: [5, 3]
                },
                {
                    label: 'With Extra Repayments',
                    data: extraBalances,
                    borderColor: '#00C896',
                    backgroundColor: isDark ? 'rgba(0,200,150,0.15)' : 'rgba(0,200,150,0.1)',
                    fill: true, tension: 0.4, pointRadius: 2
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            plugins: {
                legend: { display: true, position: 'top', labels: { color: textColor, font: { family: 'DM Sans', size: 12 }, boxWidth: 12, padding: 16 } },
                tooltip: { mode: 'index', intersect: false, callbacks: { label: c => ' ' + c.dataset.label + ': ' + fmt(c.raw) } }
            },
            scales: {
                x: { ticks: { color: textColor, maxTicksLimit: 10, font: { family: 'DM Sans', size: 11 } }, grid: { color: gridColor } },
                y: { ticks: { color: textColor, callback: v => '$' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v), font: { family: 'DM Sans', size: 11 } }, grid: { color: gridColor } }
            },
            animation: { duration: 500 }
        }
    });
}


// ─── Repayment Schedule ───────────────────────────────────────

// Track current view mode ('yearly' | 'monthly')
let schedViewMode = 'yearly';
// Store schedule data for view toggling without recalculating
let schedData = null;

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Equity milestones: LVR thresholds to flag (in descending LVR = ascending equity)
const EQUITY_MILESTONES = [
    { lvr: 80, label: 'LVR 80% — LMI-free zone',       cls: 'milestone-lmi'    },
    { lvr: 70, label: 'LVR 70% — strong equity',        cls: 'milestone-70'     },
    { lvr: 60, label: 'LVR 60% — refinance ready',      cls: 'milestone-60'     },
    { lvr: 50, label: '50% equity milestone',            cls: 'milestone-50'     },
    { lvr: 25, label: '75% equity — near payoff',        cls: 'milestone-75eq'   },
];

function generateSchedule(r) {
    const tbody = document.getElementById('scheduleBody');
    tbody.innerHTML = '';

    // Determine start date — use today as month 0
    const now = new Date();
    const startYear  = now.getFullYear();
    const startMonth = now.getMonth(); // 0-indexed

    const months = r.loanTermYears * 12;
    let balance = r.loanAmount;
    let cumP = 0, cumI = 0;

    // Track which milestones have already been shown
    const shownMilestones = new Set();

    const rows = [];

    for (let m = 1; m <= months; m++) {
        const eff       = Math.max(0, balance - r.offsetAccount);
        const interest  = eff * r.monthlyRate;
        const isIOperiod = r.isInterestOnly && m <= (r.ioTermYears * 12);
        let principal, payment;
        if (isIOperiod) { principal = 0; payment = interest; }
        else {
            payment   = r.monthlyPayment;
            principal = Math.min(Math.max(0, payment - interest), balance);
        }
        cumP    += principal;
        cumI    += interest;
        balance  = Math.max(0, balance - principal);

        // Calendar date for this payment
        const absMonth = startMonth + m;
        const calYear  = startYear + Math.floor(absMonth / 12);
        const calMon   = absMonth % 12; // 0-indexed
        const dateStr  = MONTH_NAMES[calMon] + ' ' + calYear;
        const isFYEnd  = calMon === 5; // June = index 5 = financial year end

        // LVR and equity
        const lvr    = r.propertyPrice > 0 ? (balance / r.propertyPrice) * 100 : 0;
        const equity = r.propertyPrice > 0 ? r.propertyPrice - balance : 0;
        const equityPct = r.propertyPrice > 0 ? (equity / r.propertyPrice) * 100 : 0;

        // Interest percentage of payment
        const intPct = payment > 0 ? (interest / payment * 100) : 0;

        // Check milestones
        const milestones = [];
        for (const ms of EQUITY_MILESTONES) {
            const key = ms.lvr;
            if (!shownMilestones.has(key) && lvr <= ms.lvr) {
                shownMilestones.add(key);
                milestones.push(ms);
            }
        }

        rows.push({
            m, dateStr, calYear, calMon, isFYEnd, isIOperiod,
            principal, interest, payment,
            cumP, cumI, balance,
            lvr, equity, equityPct, intPct,
            milestones
        });

        if (balance < 0.01 && !r.isInterestOnly) break;
    }

    schedData = { rows, r };
    renderSchedule(rows, r, schedViewMode);
    updateScheduleSummary(rows[rows.length - 1], r);
}

function renderSchedule(rows, r, viewMode) {
    const tbody = document.getElementById('scheduleBody');
    tbody.innerHTML = '';

    if (viewMode === 'yearly') {
        // Group into years
        let yearNum = 1;
        let i = 0;
        while (i < rows.length) {
            const yearRows = rows.slice(i, i + 12).filter((_, idx) => i + idx < rows.length);
            const lastInYear = yearRows[yearRows.length - 1];
            const firstInYear = yearRows[0];
            const yearP = yearRows.reduce((s, r) => s + r.principal, 0);
            const yearI = yearRows.reduce((s, r) => s + r.interest, 0);
            const yearPay = yearRows.reduce((s, r) => s + r.payment, 0);
            const startBal = r.loanAmount - (yearRows[0].cumP - yearRows[0].principal);
            const endBal = lastInYear.balance;
            const hasFYEnd = yearRows.some(row => row.isFYEnd);
            const hasIO = yearRows.some(row => row.isIOperiod);
            const milestones = yearRows.flatMap(row => row.milestones);

            // Milestone row — inserted before year row
            milestones.forEach(ms => {
                const mRow = document.createElement('tr');
                mRow.className = 'milestone-row';
                mRow.innerHTML = `<td colspan="8"><span class="milestone-badge ${ms.cls}">◆ ${ms.label}</span></td>`;
                tbody.appendChild(mRow);
            });

            const yr = document.createElement('tr');
            yr.className = `year-row ${yearNum % 2 === 0 ? 'year-even' : 'year-odd'}${hasIO ? ' io-year' : ''}`;
            yr.dataset.year = yearNum;
            yr.innerHTML = `<td colspan="8">
                <div class="year-header-content">
                    <div class="year-title">
                        <span class="toggle-icon">▼</span>
                        <strong>Year ${yearNum}</strong>
                        <span class="year-date-range">${firstInYear.dateStr} – ${lastInYear.dateStr}</span>
                        ${hasIO ? '<span class="io-badge">IO</span>' : ''}
                        ${hasFYEnd ? '<span class="fy-badge">FY end Jun</span>' : ''}
                    </div>
                    <div class="year-summary-center">
                        <span class="ys-item"><span class="ys-label">Payment</span><span class="ys-val">${fmt(yearPay)}</span></span>
                        <span class="ys-sep">·</span>
                        <span class="ys-item"><span class="ys-label">Principal</span><span class="ys-val ys-principal">${fmt(yearP)}</span></span>
                        <span class="ys-sep">·</span>
                        <span class="ys-item"><span class="ys-label">Interest</span><span class="ys-val ys-interest">${fmt(yearI)}</span></span>
                        <span class="ys-sep">·</span>
                        <span class="ys-item"><span class="ys-label">Int%</span><span class="ys-val">${yearPay > 0 ? (yearI / yearPay * 100).toFixed(0) : 0}%</span></span>
                    </div>
                    <div class="year-summary-right">
                        <span class="ys-item"><span class="ys-label">Open</span><span class="ys-val">${fmt(startBal)}</span></span>
                        <span class="ys-sep">→</span>
                        <span class="ys-item"><span class="ys-label">Close</span><span class="ys-val">${fmt(endBal)}</span></span>
                        <span class="ys-sep">·</span>
                        <span class="ys-item"><span class="ys-label">LVR</span><span class="ys-val">${lastInYear.lvr.toFixed(1)}%</span></span>
                    </div>
                </div>
            </td>`;
            yr.addEventListener('click', function() { toggleYear(parseInt(this.dataset.year)); });
            tbody.appendChild(yr);

            yearRows.forEach(mo => {
                const mRow = document.createElement('tr');
                mRow.className = `month-row year-${yearNum}${mo.isIOperiod ? ' io-row' : ''}${mo.isFYEnd ? ' fy-row' : ''}`;
                mRow.style.display = 'none'; // collapsed by default
                mRow.innerHTML = `
                    <td data-label="Period">
                        <span class="mo-date">${mo.dateStr}</span>
                        <span class="mo-num">mo ${mo.m}</span>
                    </td>
                    <td data-label="Payment">${fmt(mo.payment)}</td>
                    <td data-label="Principal" class="col-p">${fmt(mo.principal)}</td>
                    <td data-label="Interest" class="col-i">${fmt(mo.interest)}</td>
                    <td data-label="Int %" class="col-intpct">
                        <span class="intpct-bar-wrap">
                            <span class="intpct-bar" style="width:${mo.intPct.toFixed(0)}%"></span>
                        </span>
                        <span class="intpct-val">${mo.intPct.toFixed(0)}%</span>
                    </td>
                    <td data-label="Balance">${fmt(mo.balance)}</td>
                    <td data-label="Equity" class="col-eq">${fmt(mo.equity)}</td>
                    <td data-label="LVR" class="col-lvr-cell">${mo.lvr.toFixed(1)}%</td>
                `;
                tbody.appendChild(mRow);
            });

            i += 12;
            yearNum++;
        }
    } else {
        // Monthly view — flat list with milestone rows and FY markers
        rows.forEach(mo => {
            // Milestone rows
            mo.milestones.forEach(ms => {
                const mRow = document.createElement('tr');
                mRow.className = 'milestone-row';
                mRow.innerHTML = `<td colspan="8"><span class="milestone-badge ${ms.cls}">◆ ${ms.label}</span></td>`;
                tbody.appendChild(mRow);
            });

            // FY end separator
            if (mo.isFYEnd) {
                const fyRow = document.createElement('tr');
                fyRow.className = 'fy-separator-row';
                fyRow.innerHTML = `<td colspan="8"><span class="fy-separator-label">▌ Financial Year End — ${mo.dateStr}</span></td>`;
                tbody.appendChild(fyRow);
            }

            const row = document.createElement('tr');
            row.className = `month-row-flat${mo.isIOperiod ? ' io-row' : ''}`;
            row.innerHTML = `
                <td data-label="Period">
                    <span class="mo-date">${mo.dateStr}</span>
                    <span class="mo-num">mo ${mo.m}</span>
                </td>
                <td data-label="Payment">${fmt(mo.payment)}</td>
                <td data-label="Principal" class="col-p">${fmt(mo.principal)}</td>
                <td data-label="Interest" class="col-i">${fmt(mo.interest)}</td>
                <td data-label="Int %">
                    <span class="intpct-bar-wrap">
                        <span class="intpct-bar" style="width:${mo.intPct.toFixed(0)}%"></span>
                    </span>
                    <span class="intpct-val">${mo.intPct.toFixed(0)}%</span>
                </td>
                <td data-label="Balance">${fmt(mo.balance)}</td>
                <td data-label="Equity" class="col-eq">${fmt(mo.equity)}</td>
                <td data-label="LVR">${mo.lvr.toFixed(1)}%</td>
            `;
            tbody.appendChild(row);
        });
    }

    // Show/hide summary strip
    const strip = document.getElementById('schedSummaryStrip');
    if (strip) strip.style.display = '';
}

function updateScheduleSummary(lastRow, r) {
    if (!lastRow) return;
    const el = id => document.getElementById(id);
    const finalRow = schedData?.rows[schedData.rows.length - 1];
    if (!finalRow) return;
    el('sched_paidToDate') && (el('sched_paidToDate').textContent = fmt(finalRow.cumP + finalRow.cumI));
    el('sched_interestPaid') && (el('sched_interestPaid').textContent = fmt(finalRow.cumI));
    el('sched_principalPaid') && (el('sched_principalPaid').textContent = fmt(finalRow.cumP));
    el('sched_balance') && (el('sched_balance').textContent = fmt(finalRow.balance));
    el('sched_lvr') && (el('sched_lvr').textContent = r.propertyPrice > 0 ? (finalRow.balance / r.propertyPrice * 100).toFixed(1) + '%' : '—');
    el('sched_equity') && (el('sched_equity').textContent = r.propertyPrice > 0 ? fmt(r.propertyPrice - finalRow.balance) : '—');
}

function schedSetView(view, btn) {
    schedViewMode = view;
    document.querySelectorAll('.sched-view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (schedData) renderSchedule(schedData.rows, schedData.r, view);
}

function toggleYear(year) {
    const rows = document.querySelectorAll(`.year-${year}`);
    if (!rows.length) return;
    const isHidden = rows[0].style.display === 'none';
    rows.forEach(r => r.style.display = isHidden ? '' : 'none');
    document.querySelectorAll('.year-row').forEach(r => {
        if (r.dataset.year == year) {
            const icon = r.querySelector('.toggle-icon');
            if (icon) icon.textContent = isHidden ? '▼' : '▶';
        }
    });
}

function expandAll() {
    document.querySelectorAll('.month-row').forEach(r => r.style.display = '');
    document.querySelectorAll('.toggle-icon').forEach(i => i.textContent = '▼');
}
function collapseAll() {
    document.querySelectorAll('.month-row').forEach(r => r.style.display = 'none');
    document.querySelectorAll('.toggle-icon').forEach(i => i.textContent = '▶');
}

// ─── CSV Export ───────────────────────────────────────────────
function exportCSV() {
    if (!schedData) return;
    const { rows, r } = schedData;
    const headers = ['Month','Date','Payment','Principal','Interest','Int %','Balance','Equity','LVR %','Cum. Principal','Cum. Interest'];
    const csvRows = [headers.join(',')];
    rows.forEach(row => {
        csvRows.push([
            row.m,
            row.dateStr,
            row.payment.toFixed(2),
            row.principal.toFixed(2),
            row.interest.toFixed(2),
            row.intPct.toFixed(1),
            row.balance.toFixed(2),
            row.equity.toFixed(2),
            row.lvr.toFixed(2),
            row.cumP.toFixed(2),
            row.cumI.toFixed(2),
        ].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mortgage_schedule.csv';
    a.click();
}

// ─── PDF Export ───────────────────────────────────────────────
function exportToPDF() { window.print(); }

// ─── State government stamp duty / transfer duty URLs ────────
const STATE_DUTY_LINKS = {
    NSW: { name: 'New South Wales',       url: 'https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty' },
    VIC: { name: 'Victoria',              url: 'https://www.sro.vic.gov.au/land-transfer-duty' },
    QLD: { name: 'Queensland',            url: 'https://www.qld.gov.au/housing/buying-owning-home/advice-buying-home/transfer-duty' },
    WA:  { name: 'Western Australia',     url: 'https://www.wa.gov.au/organisation/department-of-finance/transfer-duty' },
    SA:  { name: 'South Australia',       url: 'https://www.revenuesa.sa.gov.au/taxes-and-royalties/stamp-duties' },
    TAS: { name: 'Tasmania',              url: 'https://www.sro.tas.gov.au/duties' },
    ACT: { name: 'ACT',                   url: 'https://www.revenue.act.gov.au/duties/conveyance-duty' },
    NT:  { name: 'Northern Territory',    url: 'https://nt.gov.au/employ/money-and-taxes/taxes-royalties-and-grants/stamp-duty' },
};

// FHB-specific concession/grant pages per state
const FHB_LINKS = {
    NSW: { label: 'First Home Buyer Assistance Scheme',  url: 'https://www.revenue.nsw.gov.au/grants-schemes/first-home-buyer' },
    VIC: { label: 'First Home Buyer Duty Exemption',     url: 'https://www.sro.vic.gov.au/first-home-buyer' },
    QLD: { label: 'First Home Concession',               url: 'https://www.qld.gov.au/housing/buying-owning-home/financial-help-concessions/qld-first-home-grant' },
    WA:  { label: 'First Home Owner Rate of Duty',       url: 'https://www.wa.gov.au/organisation/department-of-finance/first-home-owner-rate-duty' },
    SA:  { label: 'First Home Owner Grant (SA)',         url: 'https://www.revenuesa.sa.gov.au/grants-and-concessions/first-home-owners-grant' },
    TAS: { label: 'First Home Owner Grant (TAS)',        url: 'https://www.sro.tas.gov.au/first-home-owner' },
    ACT: { label: 'Home Buyer Concession Scheme',        url: 'https://www.revenue.act.gov.au/duties/conveyance-duty/home-buyer-concession-scheme' },
    NT:  { label: 'First Home Owner Grant (NT)',         url: 'https://nt.gov.au/employ/money-and-taxes/taxes-royalties-and-grants/first-home-owner-grant' },
};

// ─── Stamp Duty Calculator ────────────────────────────────────
const STAMP_DUTY_RATES = {
    NSW: { brackets: [[14000,1.25],[32000,1.5],[85000,1.75],[320000,3.5],[1000000,4.5],[3000000,5.5],[Infinity,7]] },
    VIC: { brackets: [[25000,1.4],[130000,2.4],[440000,5],[960000,6],[2000000,6.5],[Infinity,6.5]] },
    QLD: { brackets: [[5000,0],[75000,1.5],[540000,3.5],[1000000,4.5],[Infinity,5.75]] },
    WA:  { brackets: [[120000,1.9],[150000,2.85],[360000,3.8],[725000,4.75],[Infinity,5.15]] },
    SA:  { brackets: [[12000,1],[30000,2],[50000,3],[100000,3.5],[200000,4],[250000,4.25],[Infinity,5.5]] },
    TAS: { brackets: [[3000,0],[25000,1.75],[75000,2.25],[200000,3.5],[375000,4],[725000,4.25],[Infinity,4.5]] },
    ACT: { brackets: [[200000,0.6],[300000,2.2],[500000,3.4],[750000,4.32],[1000000,5.9],[Infinity,6.4]] },
    NT:  { brackets: [[525000,3.93],[3000000,4.95],[5000000,5.75],[Infinity,5.75]] }
};
const FHB_THRESHOLDS = { NSW:800000, VIC:600000, QLD:500000, WA:430000, SA:0, TAS:600000, ACT:0, NT:0 };

function estimateStampDuty(state, price) {
    const rates = STAMP_DUTY_RATES[state];
    if (!rates) return 0;
    let duty = 0, prev = 0;
    for (const [threshold, rate] of rates.brackets) {
        const bracket = Math.min(price, threshold) - prev;
        if (bracket <= 0) break;
        duty += bracket * (rate / 100);
        prev = threshold;
        if (price <= threshold) break;
    }
    return duty;
}

// ─── LMI Estimation (indicative Genworth/QBE rates 2024-25) ──
function estimateLMI(loanAmount, propertyPrice) {
    if (!propertyPrice || !loanAmount) return 0;
    const lvr = (loanAmount / propertyPrice) * 100;
    if (lvr <= 80) return 0;
    // LMI premium rates as % of loan amount by LVR band and loan size
    // Source: indicative Genworth/QBE schedules (not exact — for estimation only)
    let premiumRate;
    if (lvr <= 85) {
        premiumRate = loanAmount <= 300000 ? 0.0108 : loanAmount <= 500000 ? 0.0133 : loanAmount <= 750000 ? 0.0152 : 0.0175;
    } else if (lvr <= 90) {
        premiumRate = loanAmount <= 300000 ? 0.0198 : loanAmount <= 500000 ? 0.0244 : loanAmount <= 750000 ? 0.0280 : 0.0319;
    } else if (lvr <= 95) {
        premiumRate = loanAmount <= 300000 ? 0.0369 : loanAmount <= 500000 ? 0.0456 : loanAmount <= 750000 ? 0.0524 : 0.0597;
    } else {
        premiumRate = 0.065; // >95% LVR — very high risk
    }
    // Add 10% stamp duty on LMI premium (applies in most states)
    return Math.round(loanAmount * premiumRate * 1.1);
}

// ─── Buyer Type Toggle — Upfront Costs Tab ───────────────────
function initBuyerTypeToggle() {
    document.querySelectorAll('[name="buyerType"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === 'investor') applyInvestorMode();
            else applyOwnerMode();
        });
    });
}

// Changes made when switching to Investor — shown in advisory first
const INVESTOR_CHANGES = [
    {
        icon: '🚫',
        title: 'First Home Buyer exemptions disabled',
        detail: 'FHB concessions only apply to owner-occupied purchases. Investment properties pay full transfer duty regardless of buyer history.',
        action: 'fhb-disable'
    },
    {
        icon: '🚫',
        title: 'Moving costs zeroed out',
        detail: 'You won\'t be moving into the property. Moving costs have been set to $0 — adjust if you have any associated removal or storage costs.',
        action: 'moving-zero'
    },
    {
        icon: '🚫',
        title: 'Utility connection fees zeroed out',
        detail: 'Tenants typically arrange their own utility connections. Set to $0 — add back if you need to pre-connect services before tenancy.',
        action: 'connections-zero'
    },
    {
        icon: '🏷️',
        title: 'Building Insurance relabelled to Landlord Insurance',
        detail: 'Investors need landlord insurance (covers building + loss of rent + liability) rather than standard building insurance.',
        action: 'insurance-label'
    },
    {
        icon: '💼',
        title: 'Conveyancing range updated ($2,000–$4,000)',
        detail: 'Investment property conveyancing often costs more — solicitors review existing leases, tenancy agreements, depreciation entitlements, and GST implications.',
        action: 'conveyancing-range'
    },
    {
        icon: '✅',
        title: 'Quantity Surveyor report added ($800)',
        detail: 'A QS depreciation report is required by the ATO to claim Division 40 (plant & equipment) and Division 43 (building) tax deductions. Typically $600–$1,200.',
        action: 'qs-add'
    },
    {
        icon: '✅',
        title: 'Accounting / Tax Agent setup fee added ($500)',
        detail: 'First-year setup with a tax agent for your investment property — establishing the income/expense tracking structure, depreciation schedule, and entity-level advice.',
        action: 'accounting-add'
    },
];

function applyInvestorMode() {
    // 1. Show advisory panel collapsed — user clicks to expand
    const advisory = document.getElementById('uc_investorAdvisory');
    const list     = document.getElementById('uc_advisoryList');
    const count    = document.getElementById('uc_advisoryCount');
    const toggle   = document.getElementById('uc_advisoryToggle');
    if (advisory && list) {
        list.innerHTML = INVESTOR_CHANGES.map(c => `
            <li class="uc-advisory-item">
                <span class="uc-advisory-icon">${c.icon}</span>
                <div>
                    <strong>${c.title}</strong>
                    <p>${c.detail}</p>
                </div>
            </li>
        `).join('');
        // Show banner collapsed, list stays hidden
        advisory.classList.remove('hidden');
        list.classList.add('hidden');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
        if (count)  count.textContent = INVESTOR_CHANGES.length + ' changes';
    }

    // 2. Apply field changes after brief delay
    setTimeout(() => {
        // FHB — disable and uncheck
        const fhb = document.getElementById('fhbCheck');
        const fhbGroup = document.getElementById('uc_fhbGroup');
        if (fhb) { fhb.checked = false; fhb.disabled = true; }
        if (fhbGroup) fhbGroup.classList.add('uc-field-disabled');

        // Moving costs — zero and disable
        setFieldDisabled('uc_moving',      true, 0);
        setFieldDisabled('uc_connections', true, 0);

        // Insurance label → Landlord Insurance
        const insLabel = document.getElementById('uc_insuranceLabel');
        if (insLabel) insLabel.innerHTML = 'Landlord Insurance (1st yr) <span class="optional-label">$900–$3,000</span>';

        // Conveyancing range hint
        const convRange = document.getElementById('uc_conveyancingRange');
        if (convRange) convRange.textContent = '$2,000–$4,000';
        const convInput = document.getElementById('uc_conveyancing');
        if (convInput && convInput.value < 2500) convInput.value = 2800;

        // Show investor-only fields
        document.getElementById('uc_qsGroup')?.classList.remove('hidden');
        document.getElementById('uc_accountingGroup')?.classList.remove('hidden');

        // Rename moving section label
        const movLabel = document.getElementById('uc_movingLabel');
        if (movLabel) movLabel.textContent = 'Setup Costs';
    }, 180);
}

function toggleAdvisory() {
    const list   = document.getElementById('uc_advisoryList');
    const toggle = document.getElementById('uc_advisoryToggle');
    if (!list || !toggle) return;
    const isHidden = list.classList.contains('hidden');
    list.classList.toggle('hidden', !isHidden);
    toggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    // Rotate chevron via aria-expanded CSS
}

function applyOwnerMode() {
    // Hide advisory
    const advisory = document.getElementById('uc_investorAdvisory');
    if (advisory) advisory.classList.add('hidden');

    // FHB — re-enable
    const fhb = document.getElementById('fhbCheck');
    const fhbGroup = document.getElementById('uc_fhbGroup');
    if (fhb) fhb.disabled = false;
    if (fhbGroup) fhbGroup.classList.remove('uc-field-disabled');

    // Moving costs — re-enable with defaults
    setFieldDisabled('uc_moving',      false, 1500);
    setFieldDisabled('uc_connections', false, 300);

    // Insurance label → Building Insurance
    const insLabel = document.getElementById('uc_insuranceLabel');
    if (insLabel) insLabel.innerHTML = 'Building Insurance (1st yr) <span class="optional-label">$800–$2,500</span>';

    // Conveyancing range hint
    const convRange = document.getElementById('uc_conveyancingRange');
    if (convRange) convRange.textContent = '$1,500–$3,500';
    const convInput = document.getElementById('uc_conveyancing');
    if (convInput && convInput.value >= 2800) convInput.value = 2200;

    // Hide investor-only fields
    document.getElementById('uc_qsGroup')?.classList.add('hidden');
    document.getElementById('uc_accountingGroup')?.classList.add('hidden');

    // Restore moving section label
    const movLabel = document.getElementById('uc_movingLabel');
    if (movLabel) movLabel.textContent = 'Moving & Setup Costs';
}

function setFieldDisabled(id, disabled, defaultVal) {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = disabled;
    if (disabled) {
        el._prevValue = el.value;
        el.value = defaultVal;
    } else {
        el.value = el._prevValue ?? defaultVal;
    }
    const wrap = el.closest('.input-wrap');
    const group = el.closest('.form-group');
    if (wrap)  wrap.classList.toggle('input-wrap--disabled', disabled);
    if (group) group.classList.toggle('uc-field-disabled', disabled);
}

function calculateStampDuty() {
    const state     = document.getElementById('sdState').value;
    const price     = parseFloat(document.getElementById('sdPrice').value)    || 0;
    const deposit   = parseFloat(document.getElementById('sdDeposit')?.value) || 0;
    const loanAmt   = Math.max(0, price - deposit);
    const isFHB     = document.getElementById('fhbCheck').checked;
    const buyerType = document.querySelector('[name="buyerType"]:checked').value;

    // ── Stamp duty with FHB concessions ───────────────────────
    let duty = estimateStampDuty(state, price);
    let concession = '';
    if (isFHB && buyerType === 'owner') {
        const threshold = FHB_THRESHOLDS[state];
        if (price <= threshold && threshold > 0) {
            concession = 'Full FHB exemption'; duty = 0;
        } else if (price <= threshold * 1.3 && threshold > 0) {
            concession = 'Partial FHB concession'; duty = Math.round(duty * 0.5);
        }
    }

    // ── LMI (auto-calculated, shown as notice) ────────────────
    const lmi   = estimateLMI(loanAmt, price);
    const lvr   = price > 0 ? (loanAmt / price * 100) : 0;
    const lmiEl = document.getElementById('uc_lmiNotice');
    if (lmiEl) {
        if (lmi > 0) {
            lmiEl.style.display = '';
            lmiEl.innerHTML = `⚠️ LMI applies (LVR ${lvr.toFixed(1)}%) — est. <strong>${fmt(lmi)}</strong> added to lender fees. Can be capitalised into loan.`;
        } else {
            lmiEl.style.display = 'none';
        }
    }
    if (document.getElementById('sdLoanAmount')) {
        document.getElementById('sdLoanAmount').value = loanAmt;
    }

    // ── Read all upfront cost fields ───────────────────────────
    // Use null-safe read: only fall back to default if field is missing or empty string, never when value is 0
    const r = (id, def) => {
        const el = document.getElementById(id);
        if (!el) return def;
        const v = el.value.trim();
        return v === '' ? def : (parseFloat(v) || 0);
    };
    const isInvestor = buyerType === 'investor';
    const conveyancing       = r('uc_conveyancing',      2200);
    const buildingInspection = r('uc_buildingInspection', 600);
    const pestInspection     = r('uc_pestInspection',     300);
    const buyersAgent        = r('uc_buyersAgent',          0);
    const lenderApp          = r('uc_lenderApp',          600);
    const valuation          = r('uc_valuation',          300);
    const mortgageReg        = r('uc_mortgageReg',        148);
    const titleSearch        = r('uc_titleSearch',        250);
    // Moving & connections: always 0 for investors regardless of DOM value
    const moving             = isInvestor ? 0 : r('uc_moving',      1500);
    const connections        = isInvestor ? 0 : r('uc_connections',  300);
    const buildingInsurance  = r('uc_insurance',         1200);
    const other              = r('uc_other',             2000);

    // ── Group totals ───────────────────────────────────────────
    const fhbLink = (isFHB && buyerType === 'owner') ? FHB_LINKS[state] : null;
    const govItems = [
        { label: 'Transfer Duty (' + state + ')', amount: duty, note: concession, link: fhbLink },
        { label: 'Mortgage Registration',          amount: mortgageReg },
        { label: 'Title Search & Transfer',        amount: titleSearch },
    ];
    const profItems = [
        { label: 'Conveyancing / Legal',           amount: conveyancing },
        { label: 'Building Inspection',            amount: buildingInspection },
        { label: 'Pest Inspection',                amount: pestInspection },
        ...(buyersAgent > 0 ? [{ label: "Buyer's Agent", amount: buyersAgent }] : []),
        ...(isInvestor ? (() => {
            const qs  = parseFloat(document.getElementById('uc_qsReport')?.value) || 0;
            const acc = parseFloat(document.getElementById('uc_accounting')?.value) || 0;
            const items = [];
            if (qs  > 0) items.push({ label: 'Quantity Surveyor Report', amount: qs,  note: 'Div 40/43' });
            if (acc > 0) items.push({ label: 'Accounting / Tax Setup',   amount: acc, note: 'first year' });
            return items;
        })() : []),
    ];
    const lenderItems = [
        { label: 'Lender Application Fee',         amount: lenderApp },
        { label: 'Bank Valuation Fee',             amount: valuation },
        ...(lmi > 0 ? [{ label: 'LMI Premium (est.)', amount: lmi, note: 'LVR ' + lvr.toFixed(1) + '%' }] : []),
    ];
    const insuranceLabel = isInvestor ? 'Landlord Insurance (1st yr)' : 'Building Insurance (1st yr)';

    const movingItems = [
        ...(moving      > 0 ? [{ label: 'Moving Costs',          amount: moving      }] : []),
        ...(connections > 0 ? [{ label: 'Utility Connections',   amount: connections }] : []),
        { label: insuranceLabel,                                   amount: buildingInsurance },
        ...(other > 0 ? [{ label: 'Other / Buffer',              amount: other       }] : []),
    ];

    const govTotal    = govItems.reduce((s, i) => s + i.amount, 0);
    const profTotal   = profItems.reduce((s, i) => s + i.amount, 0);
    const lenderTotal = lenderItems.reduce((s, i) => s + i.amount, 0);
    const movingTotal = movingItems.reduce((s, i) => s + i.amount, 0);
    const feesTotal   = govTotal + profTotal + lenderTotal + movingTotal;
    const grandTotal  = deposit + feesTotal;

    // ── Update Moving & Setup group header for investor ───────
    const movingGroupHeader = document.getElementById('uc_movingGroupTitle');
    if (movingGroupHeader) {
        movingGroupHeader.textContent = isInvestor ? 'Setup Costs' : 'Moving & Setup';
    }

    // ── Render group cards ─────────────────────────────────────
    const renderGroup = (id, items, totalId, total) => {
        document.getElementById(totalId).textContent = fmt(total);
        document.getElementById(id).innerHTML = items.map(item => {
            const labelHtml = item.link
                ? `<a href="${item.link.url}" target="_blank" rel="noopener" class="uc-row-link" title="${item.link.label}">${item.label} <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-1px;opacity:0.6"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`
                : item.label;
            return `<div class="uc-row">
                <span>${labelHtml}${item.note ? ' <span class="uc-note">' + item.note + '</span>' : ''}</span>
                <strong>${fmt(item.amount)}</strong>
            </div>`;
        }).join('');
    };
    renderGroup('uc_govRows',    govItems,    'uc_govTotal',    govTotal);
    renderGroup('uc_profRows',   profItems,   'uc_profTotal',   profTotal);
    renderGroup('uc_lenderRows', lenderItems, 'uc_lenderTotal', lenderTotal);
    renderGroup('uc_movingRows', movingItems, 'uc_movingTotal', movingTotal);

    // ── Hero card ──────────────────────────────────────────────
    document.getElementById('uc_totalAmount').textContent = fmt(grandTotal);
    document.getElementById('uc_totalSub').innerHTML =
        fmt(deposit) + ' deposit &nbsp;+&nbsp; ' + fmt(feesTotal) + ' in fees &amp; costs' +
        ' <span class="uc-pct-label">(' + ((feesTotal / price) * 100).toFixed(1) + '% of price)</span>';

    // ── Donut chart ────────────────────────────────────────────
    const movingCategoryLabel = isInvestor ? 'Setup Costs' : 'Moving & Setup';
    const donutLabels = ['Deposit', 'Govt & Tax', 'Professional', 'Lender', movingCategoryLabel];
    const donutColors = ['#0A2540', '#2563EB', '#F5A623', '#E24B4A', '#00C896'];
    const donutData   = [deposit, govTotal, profTotal, lenderTotal, movingTotal];

    const ctx = document.getElementById('uc_donut');
    if (ucDonutInstance) ucDonutInstance.destroy();
    ucDonutInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: donutLabels, datasets: [{ data: donutData, backgroundColor: donutColors, borderWidth: 0, hoverOffset: 6 }] },
        options: {
            responsive: false, cutout: '60%',
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: c => ' ' + c.label + ': ' + fmt(c.raw) + ' (' + ((c.raw / grandTotal) * 100).toFixed(1) + '%)' } }
            },
            animation: { duration: 500 }
        }
    });

    // ── Stacked bar ────────────────────────────────────────────
    const barEl = document.getElementById('uc_stackedBar');
    const legEl = document.getElementById('uc_barLegend');
    const segments = [
        { label: 'Deposit',              amount: deposit,    color: '#0A2540' },
        { label: 'Govt & Tax',           amount: govTotal,   color: '#2563EB' },
        { label: 'Professional',         amount: profTotal,  color: '#F5A623' },
        { label: 'Lender',               amount: lenderTotal,color: '#E24B4A' },
        { label: movingCategoryLabel,    amount: movingTotal,color: '#00C896' },
    ].filter(s => s.amount > 0);

    barEl.innerHTML = segments.map(s => {
        const pct = (s.amount / grandTotal * 100).toFixed(1);
        return `<div class="uc-bar-seg" style="width:${pct}%;background:${s.color}" title="${s.label}: ${fmt(s.amount)} (${pct}%)"></div>`;
    }).join('');

    legEl.innerHTML = segments.map(s => `
        <div class="uc-leg-item">
            <span class="uc-leg-dot" style="background:${s.color}"></span>
            ${s.label}
            <span class="uc-leg-amt">${fmt(s.amount)}</span>
            <span class="uc-leg-pct">${(s.amount / grandTotal * 100).toFixed(1)}%</span>
        </div>
    `).join('');

    // ── All states stamp duty comparison ──────────────────────
    const allStates   = Object.keys(STAMP_DUTY_RATES);
    const dutyAmounts = allStates.map(s => ({ state: s, amount: estimateStampDuty(s, price) }));
    const maxDuty     = Math.max(...dutyAmounts.map(d => d.amount));
    document.getElementById('sdCompTable').innerHTML = dutyAmounts.map(d => {
        const info = STATE_DUTY_LINKS[d.state] || {};
        const stateLabel = info.url
            ? `<a href="${info.url}" target="_blank" rel="noopener" class="sd-state-link">${d.state}</a>`
            : d.state;
        return `
        <div class="sd-comp-row">
            <span class="sd-comp-state">${stateLabel}</span>
            <div class="sd-comp-bar-wrap">
                <div class="sd-comp-bar" style="width:${maxDuty > 0 ? (d.amount / maxDuty * 100) : 0}%"></div>
            </div>
            <span class="sd-comp-amount">${fmt(d.amount)}</span>
        </div>`;
    }).join('');

    // ── Show results ───────────────────────────────────────────
    document.getElementById('uc_heroCard').classList.remove('hidden');
    document.getElementById('uc_breakdown').classList.remove('hidden');
    document.getElementById('uc_barSection').classList.remove('hidden');
}

// ─── Borrowing Power ──────────────────────────────────────────

// Australian income tax brackets 2024-25 (excl. Medicare levy)
function calcAustralianTax(grossIncome) {
    const brackets = [
        { min: 0,       max: 18200,   rate: 0,     base: 0 },
        { min: 18201,   max: 45000,   rate: 0.19,  base: 0 },
        { min: 45001,   max: 120000,  rate: 0.325, base: 5092 },
        { min: 120001,  max: 180000,  rate: 0.37,  base: 29467 },
        { min: 180001,  max: Infinity,rate: 0.45,  base: 51667 },
    ];
    const medicare = grossIncome * 0.02;
    let tax = 0;
    for (const b of brackets) {
        if (grossIncome > b.min) {
            tax = b.base + (Math.min(grossIncome, b.max) - b.min) * b.rate;
        }
    }
    // Low Income Tax Offset
    let lito = 0;
    if (grossIncome <= 37500) lito = 700;
    else if (grossIncome <= 45000) lito = 700 - (grossIncome - 37500) * 0.05;
    else if (grossIncome <= 66667) lito = 325 - (grossIncome - 45000) * 0.015;
    return Math.max(0, tax - lito) + medicare;
}

// HEM (Household Expenditure Measure) monthly benchmarks — indicative 2024
function getHEM(annualGross, dependants) {
    // Base HEM by income band (single, no dependants)
    let base;
    if (annualGross < 60000)       base = 1900;
    else if (annualGross < 90000)  base = 2300;
    else if (annualGross < 120000) base = 2700;
    else if (annualGross < 150000) base = 3100;
    else                           base = 3500;
    return base + dependants * 500;
}

function calcMaxLoan(availableMonthly, assessmentRate, termYears) {
    const r = (assessmentRate / 100) / 12;
    const n = termYears * 12;
    if (r <= 0 || availableMonthly <= 0) return 0;
    return availableMonthly * (Math.pow(1 + r, n) - 1) / (r * Math.pow(1 + r, n));
}

function calculateBorrowingPower() {
    // ── Inputs ─────────────────────────────────────────────────
    const grossIncome   = parseFloat(document.getElementById('grossIncome').value)   || 0;
    const partnerIncome = parseFloat(document.getElementById('partnerIncome').value) || 0;
    const bonusIncome   = parseFloat(document.getElementById('bonusIncome').value)   || 0;
    const rentalIncome  = parseFloat(document.getElementById('rentalIncome').value)  || 0;
    const otherIncome   = parseFloat(document.getElementById('otherIncome').value)   || 0;
    const monthlyExpenses = parseFloat(document.getElementById('monthlyExpenses').value) || 0;
    const existingDebts   = parseFloat(document.getElementById('existingDebts').value)   || 0;
    const creditCards     = parseFloat(document.getElementById('creditCards').value)     || 0;
    const dependants      = parseInt(document.getElementById('dependants').value)        || 0;
    const loanRate        = parseFloat(document.getElementById('bpLoanRate').value)      || 6.29;
    const assessmentRate  = parseFloat(document.getElementById('bpRate').value)          || (loanRate + 3);
    const loanTerm        = parseInt(document.getElementById('bpLoanTerm').value)        || 30;
    const deposit         = parseFloat(document.getElementById('bpDeposit').value)       || 0;

    // ── Income calculations ────────────────────────────────────
    const shadedBonus     = bonusIncome * 0.60;   // 60% shading
    const shadedRental    = rentalIncome * 0.80;  // 80% of gross
    const totalGross      = grossIncome + partnerIncome + shadedBonus + shadedRental + otherIncome;

    // Tax on primary + partner income (largest two components)
    const tax1 = calcAustralianTax(grossIncome);
    const tax2 = calcAustralianTax(partnerIncome);
    const totalTax = tax1 + tax2;
    const monthlyNetIncome = (totalGross - totalTax) / 12;

    // ── HEM benchmark ──────────────────────────────────────────
    const hemBenchmark = getHEM(grossIncome + partnerIncome, dependants);
    // Lenders use the HIGHER of declared expenses and HEM
    const effectiveLiving = Math.max(monthlyExpenses, hemBenchmark);

    // ── Monthly commitments ────────────────────────────────────
    const creditCardCommitment = creditCards * 0.038;
    const dependantAllowance   = dependants * 500;
    const totalCommitments     = effectiveLiving + existingDebts + creditCardCommitment + dependantAllowance;

    // ── Serviceability ─────────────────────────────────────────
    const availableForRepayment = monthlyNetIncome - totalCommitments;
    const maxLoan     = calcMaxLoan(availableForRepayment, assessmentRate, loanTerm);
    const maxLoanRounded = Math.floor(maxLoan / 5000) * 5000;
    const propertyPrice  = maxLoanRounded + deposit;
    const dsr            = totalCommitments / monthlyNetIncome;
    const bufferAmount   = availableForRepayment - (maxLoanRounded * (loanRate / 100) / 12);

    // ── Display ────────────────────────────────────────────────
    document.getElementById('bpAmount').textContent = fmt(maxLoanRounded);
    document.getElementById('bpSub').textContent = 'at ' + assessmentRate.toFixed(2) + '% assessment rate · ' + loanTerm + '-year term';
    document.getElementById('bpPropertyPrice').textContent = fmt(propertyPrice);
    document.getElementById('bpPropertySub').textContent = fmt(maxLoanRounded) + ' loan + ' + fmt(deposit) + ' deposit';

    // HEM hint
    const hemHint = document.getElementById('bpHemHint');
    if (hemHint) {
        const usingHEM = effectiveLiving > monthlyExpenses;
        hemHint.className = 'bp-hem-hint ' + (usingHEM ? 'bp-hem-warn' : 'bp-hem-ok');
        hemHint.textContent = usingHEM
            ? '⚠️ HEM benchmark (' + fmt(hemBenchmark) + '/mo) applied — lenders use the higher figure'
            : '✓ Your declared expenses exceed HEM benchmark (' + fmt(hemBenchmark) + '/mo)';
    }

    // Income rows
    const incomeRows = [
        { label: 'Base Salary / Wages',           val: grossIncome,   sub: '' },
        { label: 'Partner Income',                 val: partnerIncome, sub: '' },
        { label: 'Bonus / Commission (60% shaded)', val: shadedBonus,  sub: '' },
        { label: 'Rental Income (80% shaded)',     val: shadedRental,  sub: '' },
        { label: 'Other Income',                   val: otherIncome,   sub: '' },
    ].filter(r => r.val > 0);
    incomeRows.push({ label: 'Total Assessable Income', val: totalGross, cls: 'bp-row-total', sub: fmt(totalGross / 12) + '/mo net before tax' });

    document.getElementById('bpIncomeRows').innerHTML = incomeRows.map(r => `
        <div class="bp-row ${r.cls || ''}">
            <span>${r.label}${r.sub ? '<br><small>' + r.sub + '</small>' : ''}</span>
            <strong>${fmt(r.val)}</strong>
        </div>`).join('');

    // Expense rows
    const expRows = [
        { label: 'Living Expenses' + (effectiveLiving > monthlyExpenses ? ' <span class="bp-hem-tag">HEM</span>' : ''), val: effectiveLiving },
        { label: 'Existing Loan Repayments',  val: existingDebts },
        { label: 'Credit Card Commitment',    val: creditCardCommitment, sub: '3.8% of ' + fmt(creditCards) + ' limit' },
        { label: 'Dependant Allowance',        val: dependantAllowance,   sub: dependants + ' × $500' },
    ].filter(r => r.val > 0);
    expRows.push({ label: 'Total Monthly Commitments', val: totalCommitments, cls: 'bp-row-total' });

    document.getElementById('bpExpenseRows').innerHTML = expRows.map(r => `
        <div class="bp-row ${r.cls || ''}">
            <span>${r.label}${r.sub ? '<br><small>' + r.sub + '</small>' : ''}</span>
            <strong>${fmt(r.val)}/mo</strong>
        </div>`).join('');

    // Serviceability rows
    const dsrClass = dsr > 0.45 ? 'bp-val-warn' : dsr > 0.35 ? 'bp-val-caution' : 'bp-val-ok';
    document.getElementById('bpServiceRows').innerHTML = `
        <div class="bp-row"><span>Monthly Net Income (est.)</span><strong>${fmt(monthlyNetIncome)}/mo</strong></div>
        <div class="bp-row"><span>Monthly Commitments</span><strong>${fmt(totalCommitments)}/mo</strong></div>
        <div class="bp-row"><span>Available for Repayments</span><strong class="bp-val-ok">${fmt(availableForRepayment)}/mo</strong></div>
        <div class="bp-row"><span>Debt-to-Income Ratio</span><strong class="${dsrClass}">${(dsr * 100).toFixed(1)}% ${dsr > 0.45 ? '⚠️ High' : dsr > 0.35 ? '↗ Moderate' : '✓ OK'}</strong></div>
        <div class="bp-row"><span>Assessment Rate</span><strong>${assessmentRate.toFixed(2)}% (${loanRate}% + ${(assessmentRate - loanRate).toFixed(2)}% buffer)</strong></div>
        <div class="bp-row bp-row-total"><span>Max Borrowing Power</span><strong>${fmt(maxLoanRounded)}</strong></div>
    `;

    // Tax rows
    const effectiveTaxRate = totalGross > 0 ? (totalTax / totalGross * 100).toFixed(1) : '0';
    document.getElementById('bpTaxRows').innerHTML = `
        <div class="bp-row"><span>Primary Income Tax + Medicare</span><strong>${fmt(tax1)}/yr</strong></div>
        ${partnerIncome > 0 ? `<div class="bp-row"><span>Partner Tax + Medicare</span><strong>${fmt(tax2)}/yr</strong></div>` : ''}
        <div class="bp-row bp-row-total"><span>Total Tax (est.)</span><strong>${fmt(totalTax)}/yr</strong></div>
        <div class="bp-row"><span>Effective Tax Rate</span><strong>${effectiveTaxRate}%</strong></div>
        <div class="bp-row"><span>Monthly Take-home (combined)</span><strong>${fmt(monthlyNetIncome)}/mo</strong></div>
    `;

    // Rate sensitivity table
    const rateScenarios = [loanRate - 1, loanRate - 0.5, loanRate, loanRate + 0.5, loanRate + 1, loanRate + 1.5, loanRate + 2].filter(r => r > 0);
    const sensitivityRows = rateScenarios.map(r => {
        const ar = r + (assessmentRate - loanRate); // keep same buffer
        const loan = Math.floor(calcMaxLoan(availableForRepayment, ar, loanTerm) / 5000) * 5000;
        const isActive = Math.abs(r - loanRate) < 0.01;
        const diff = loan - maxLoanRounded;
        return `<tr class="${isActive ? 'bp-sens-active' : ''}">
            <td>${r.toFixed(2)}%</td>
            <td>${ar.toFixed(2)}%</td>
            <td><strong>${fmt(loan)}</strong></td>
            <td class="${diff >= 0 ? 'bp-val-ok' : 'bp-val-warn'}">${diff === 0 ? '—' : (diff > 0 ? '+' : '') + fmt(diff)}</td>
        </tr>`;
    });
    document.getElementById('bpSensitivityTable').innerHTML = `
        <thead><tr><th>Loan Rate</th><th>Assessment Rate</th><th>Max Borrowing</th><th>vs Current</th></tr></thead>
        <tbody>${sensitivityRows.join('')}</tbody>`;

    // Actionable tips
    const tips = [];
    if (creditCards > 0) tips.push({ icon: '💳', text: 'Closing or reducing credit card limits can significantly increase your borrowing power. A $10,000 card adds ~$380/mo to commitments.' });
    if (effectiveLiving > monthlyExpenses) tips.push({ icon: '📊', text: 'Your living expenses are below the HEM benchmark — lenders will use the benchmark. Reducing other commitments will help more than trimming declared expenses.' });
    if (dsr > 0.45) tips.push({ icon: '⚠️', text: 'Your debt-to-income ratio is high. Lenders may cap at 6× gross income. Paying down existing debts or increasing income would help most.' });
    if (existingDebts > 0) tips.push({ icon: '🏦', text: 'Paying off existing loans before applying can increase borrowing power by up to 5–8× the monthly repayment amount.' });
    if (deposit < propertyPrice * 0.2) tips.push({ icon: '🏠', text: 'With less than 20% deposit you may need to pay LMI. Saving to 20% (or accessing a guarantor) can save tens of thousands.' });
    if (bonusIncome > 0) tips.push({ icon: '💼', text: 'Bonus income is shaded at 60%. A 2-year history of consistent bonuses may get you a higher shading at some lenders.' });

    const tipsEl = document.getElementById('bpTips');
    tipsEl.style.display = tips.length ? '' : 'none';
    tipsEl.innerHTML = tips.length ? `
        <div class="bp-tips-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            How to improve your borrowing power
        </div>
        ${tips.map(t => `<div class="bp-tip"><span class="bp-tip-icon">${t.icon}</span><p>${t.text}</p></div>`).join('')}
    ` : '';

    renderBPGauge(maxLoanRounded, availableForRepayment, totalCommitments, monthlyNetIncome);
    document.getElementById('bpResult').classList.remove('hidden');
    document.getElementById('bpEmpty').style.display = 'none';
}

function renderBPGauge(amount, available, commitments, monthlyNet) {
    const ctx = document.getElementById('bpGauge');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (bpGaugeInstance) bpGaugeInstance.destroy();
    const max = Math.max(amount * 1.5, 2000000);
    const pct = Math.min(100, (amount / max) * 100);

    // Colour by serviceability headroom
    const headroomPct = available > 0 && monthlyNet > 0 ? available / monthlyNet : 0;
    const gaugeColor = headroomPct > 0.35 ? '#00C896' : headroomPct > 0.15 ? '#F5A623' : '#E24B4A';

    bpGaugeInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [amount, Math.max(0, max - amount)],
                backgroundColor: [gaugeColor, isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'],
                borderWidth: 0, borderRadius: 4
            }]
        },
        options: {
            circumference: 180, rotation: 270, cutout: '72%',
            responsive: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            animation: { duration: 900, easing: 'easeInOutQuart' }
        }
    });

    const label = document.getElementById('bpGaugeLabel');
    if (label) {
        label.textContent = (pct).toFixed(0) + '% of scale';
        label.style.color = gaugeColor;
    }
}

// Auto-update assessment rate when loan rate changes
function initBorrowingPowerListeners() {
    const loanRateEl = document.getElementById('bpLoanRate');
    const assessRateEl = document.getElementById('bpRate');
    const rateBadge = document.getElementById('bpRateBadge');
    if (loanRateEl && assessRateEl) {
        loanRateEl.addEventListener('input', () => {
            const lr = parseFloat(loanRateEl.value) || 0;
            const ar = lr + 3;
            assessRateEl.value = ar.toFixed(2);
            if (rateBadge) rateBadge.textContent = ar.toFixed(2) + '%';
        });
        assessRateEl.addEventListener('input', () => {
            if (rateBadge) rateBadge.textContent = (parseFloat(assessRateEl.value) || 0).toFixed(2) + '%';
        });
    }
    // Update HEM hint live when living expenses or dependants change
    ['monthlyExpenses','dependants','grossIncome','partnerIncome'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateHEMHint);
    });
    updateHEMHint();
}

function updateHEMHint() {
    const grossIncome   = parseFloat(document.getElementById('grossIncome')?.value)   || 0;
    const partnerIncome = parseFloat(document.getElementById('partnerIncome')?.value) || 0;
    const dependants    = parseInt(document.getElementById('dependants')?.value)       || 0;
    const expenses      = parseFloat(document.getElementById('monthlyExpenses')?.value) || 0;
    const hem = getHEM(grossIncome + partnerIncome, dependants);
    const hint = document.getElementById('bpHemHint');
    if (!hint) return;
    const usingHEM = expenses < hem;
    hint.className = 'bp-hem-hint ' + (usingHEM ? 'bp-hem-warn' : 'bp-hem-ok');
    hint.textContent = usingHEM
        ? '⚠️ HEM benchmark: ' + new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(hem) + '/mo — lenders use the higher figure'
        : '✓ Declared expenses exceed HEM benchmark (' + new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(hem) + '/mo)';
}

// ─── Loan Comparison ──────────────────────────────────────────
function buildComparisonGrid() {
    if (comparisonLoans.length === 0) {
        comparisonLoans = [
            { name: 'Loan A', loanAmount: 600000, rate: 6.29, term: 30, freq: 'monthly', loanType: 'variable', repayType: 'pi', offset: 0, annualFee: 0 },
            { name: 'Loan B', loanAmount: 600000, rate: 5.89, term: 25, freq: 'monthly', loanType: 'variable', repayType: 'pi', offset: 0, annualFee: 395 },
        ];
    }
    renderComparisonGrid();
}

function addComparisonLoan() {
    if (comparisonLoans.length >= 3) return;
    comparisonLoans.push({
        name: 'Loan ' + String.fromCharCode(65 + comparisonLoans.length),
        loanAmount: 600000, rate: 6.5, term: 30,
        freq: 'monthly', loanType: 'variable', repayType: 'pi',
        offset: 0, annualFee: 0
    });
    renderComparisonGrid();
    document.getElementById('addLoanBtn').style.display = comparisonLoans.length >= 3 ? 'none' : '';
}

function calcLoan(loan) {
    const periodsPerYear = loan.freq === 'weekly' ? 52 : loan.freq === 'fortnightly' ? 26 : 12;
    const r = (loan.rate / 100) / periodsPerYear;
    const n = loan.term * periodsPerYear;
    const effectiveLoan = Math.max(0, loan.loanAmount - (loan.offset || 0));

    let pmt, totalInterest, totalPaid;

    if (loan.repayType === 'io') {
        pmt = effectiveLoan * r;
        totalInterest = pmt * n;
        totalPaid = loan.loanAmount + totalInterest;
    } else {
        pmt = r > 0
            ? effectiveLoan * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
            : effectiveLoan / n;
        // Simulate schedule with offset
        let bal = loan.loanAmount;
        totalInterest = 0;
        for (let i = 0; i < n; i++) {
            const eff = Math.max(0, bal - (loan.offset || 0));
            const interest = eff * r;
            const principal = pmt - interest;
            totalInterest += interest;
            bal = Math.max(0, bal - principal);
            if (bal < 0.01) break;
        }
        totalPaid = loan.loanAmount + totalInterest;
    }

    const annualFees = (loan.annualFee || 0) * loan.term;
    const trueCost5yr = pmt * periodsPerYear * 5 + (loan.annualFee || 0) * 5; // 5-yr out-of-pocket
    const monthlyEquiv = loan.freq === 'weekly' ? pmt * 52 / 12 : loan.freq === 'fortnightly' ? pmt * 26 / 12 : pmt;

    return { ...loan, pmt, totalInterest, totalPaid, annualFees, trueCost5yr, monthlyEquiv, periodsPerYear };
}

let compChartMode = 'totalInterest';

function switchCompChart(mode, btn) {
    compChartMode = mode;
    document.querySelectorAll('#compChartToggles .chart-toggle').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderCompCharts(comparisonLoans.map(calcLoan));
}

function renderComparisonGrid() {
    const results = comparisonLoans.map(calcLoan);

    // Determine "best" for each metric
    const bestInterestIdx   = results.reduce((b, r, i) => r.totalInterest < results[b].totalInterest ? i : b, 0);
    const bestRepaymentIdx  = results.reduce((b, r, i) => r.monthlyEquiv < results[b].monthlyEquiv ? i : b, 0);
    const bestTrueCostIdx   = results.reduce((b, r, i) => r.trueCost5yr < results[b].trueCost5yr ? i : b, 0);

    const LOAN_COLORS = ['#0A2540', '#00C896', '#F5A623'];

    const grid = document.getElementById('comparisonGrid');
    grid.innerHTML = results.map((r, i) => {
        const deltaInterest = i !== bestInterestIdx ? r.totalInterest - results[bestInterestIdx].totalInterest : 0;
        const deltaRepay    = i !== bestRepaymentIdx ? r.monthlyEquiv - results[bestRepaymentIdx].monthlyEquiv : 0;

        const badges = [];
        if (i === bestInterestIdx)  badges.push('<span class="comp-badge comp-badge--interest">Lowest interest</span>');
        if (i === bestRepaymentIdx) badges.push('<span class="comp-badge comp-badge--repay">Lowest repayment</span>');
        if (i === bestTrueCostIdx && results.some(r => r.annualFee > 0)) badges.push('<span class="comp-badge comp-badge--truecost">Best 5-yr cost</span>');

        const freqLabel = r.freq === 'weekly' ? '/wk' : r.freq === 'fortnightly' ? '/fn' : '/mo';
        const freqWord  = r.freq === 'weekly' ? 'Weekly' : r.freq === 'fortnightly' ? 'Fortnightly' : 'Monthly';

        return `<div class="loan-card ${badges.length ? 'best-value' : ''}" style="--card-accent:${LOAN_COLORS[i]}">
            <div class="loan-card-header">
                <div class="loan-card-title-row">
                    <span class="loan-card-color-dot" style="background:${LOAN_COLORS[i]}"></span>
                    <input class="loan-name-input" value="${r.name}" onchange="updateLoan(${i},'name',this.value)" title="Edit loan name">
                </div>
                ${comparisonLoans.length > 1 ? `<button class="loan-card-remove" onclick="removeLoan(${i})" title="Remove">✕</button>` : ''}
            </div>

            ${badges.length ? `<div class="comp-badges">${badges.join('')}</div>` : ''}

            <!-- Inputs -->
            <div class="comp-input-grid">
                <div class="form-group">
                    <label>Loan Amount</label>
                    <div class="input-wrap"><span class="input-prefix">$</span>
                    <input type="number" value="${r.loanAmount}" onchange="updateLoan(${i},'loanAmount',this.value)"></div>
                </div>
                <div class="form-group">
                    <label>Interest Rate</label>
                    <div class="input-wrap">
                    <input type="number" value="${r.rate}" step="0.01" onchange="updateLoan(${i},'rate',this.value)">
                    <span class="input-suffix">%</span></div>
                </div>
                <div class="form-group">
                    <label>Loan Term</label>
                    <div class="input-wrap">
                    <input type="number" value="${r.term}" onchange="updateLoan(${i},'term',this.value)">
                    <span class="input-suffix">yrs</span></div>
                </div>
                <div class="form-group">
                    <label>Loan Type</label>
                    <select onchange="updateLoan(${i},'loanType',this.value)">
                        <option value="variable" ${r.loanType==='variable'?'selected':''}>Variable</option>
                        <option value="fixed"    ${r.loanType==='fixed'   ?'selected':''}>Fixed</option>
                        <option value="split"    ${r.loanType==='split'   ?'selected':''}>Split</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Repayment Type</label>
                    <select onchange="updateLoan(${i},'repayType',this.value)">
                        <option value="pi" ${r.repayType==='pi'?'selected':''}>Principal &amp; Interest</option>
                        <option value="io" ${r.repayType==='io'?'selected':''}>Interest Only</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Frequency</label>
                    <select onchange="updateLoan(${i},'freq',this.value)">
                        <option value="monthly"     ${r.freq==='monthly'    ?'selected':''}>Monthly</option>
                        <option value="fortnightly" ${r.freq==='fortnightly'?'selected':''}>Fortnightly</option>
                        <option value="weekly"      ${r.freq==='weekly'     ?'selected':''}>Weekly</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Offset Balance</label>
                    <div class="input-wrap"><span class="input-prefix">$</span>
                    <input type="number" value="${r.offset||0}" onchange="updateLoan(${i},'offset',this.value)"></div>
                </div>
                <div class="form-group">
                    <label>Annual Fee</label>
                    <div class="input-wrap"><span class="input-prefix">$</span>
                    <input type="number" value="${r.annualFee||0}" step="50" onchange="updateLoan(${i},'annualFee',this.value)"></div>
                </div>
            </div>

            <!-- Results -->
            <div class="comp-results">
                <div class="loan-result-row loan-result-primary">
                    <span>${freqWord} Repayment</span>
                    <strong>${fmt(r.pmt)}<span class="loan-result-freq">${freqLabel}</span></strong>
                </div>
                <div class="loan-result-row">
                    <span>Monthly equivalent</span>
                    <strong>${fmt(r.monthlyEquiv)}/mo</strong>
                </div>
                <div class="loan-result-row">
                    <span>Annual cost</span>
                    <strong>${fmt(r.monthlyEquiv * 12)}/yr</strong>
                </div>
                <div class="loan-result-row">
                    <span>Total interest</span>
                    <strong class="comp-val-interest">${fmt(r.totalInterest)}</strong>
                </div>
                <div class="loan-result-row">
                    <span>Total fees (over term)</span>
                    <strong>${r.annualFee > 0 ? fmt(r.annualFees) : '—'}</strong>
                </div>
                <div class="loan-result-row loan-result-total">
                    <span>Total paid</span>
                    <strong>${fmt(r.totalPaid + r.annualFees)}</strong>
                </div>
                ${deltaInterest > 0 ? `<div class="loan-result-delta">+${fmt(deltaInterest)} more interest than best</div>` : ''}
                ${deltaRepay > 0    ? `<div class="loan-result-delta">+${fmt(deltaRepay)}/mo more than cheapest</div>` : ''}
            </div>
        </div>`;
    }).join('');

    renderCompCharts(results);
    renderCompSummary(results);

    document.getElementById('compChartSection').style.display   = '';
    document.getElementById('compBalanceSection').style.display = '';
    document.getElementById('compSummarySection').style.display = '';
    document.getElementById('addLoanBtn').style.display = comparisonLoans.length >= 3 ? 'none' : '';
}

function renderCompCharts(results) {
    const isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#8CA4BB' : '#8896A9';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    const COLORS    = ['#0A2540', '#00C896', '#F5A623'];

    // ── Bar chart ──────────────────────────────────────────────
    const modeLabels = {
        totalInterest:   'Total Interest',
        monthlyRepayment:'Monthly Repayment',
        totalPaid:       'Total Paid (incl. fees)',
        annualFees:      '5-Year Out-of-Pocket'
    };
    const modeValues = {
        totalInterest:   results.map(r => Math.round(r.totalInterest)),
        monthlyRepayment:results.map(r => Math.round(r.monthlyEquiv)),
        totalPaid:       results.map(r => Math.round(r.totalPaid + r.annualFees)),
        annualFees:      results.map(r => Math.round(r.trueCost5yr))
    };

    const barCtx = document.getElementById('compBarChart');
    if (compBarChartInstance) compBarChartInstance.destroy();
    compBarChartInstance = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: results.map(r => r.name),
            datasets: [{
                data: modeValues[compChartMode],
                backgroundColor: COLORS.slice(0, results.length),
                borderRadius: 6, borderWidth: 0,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: c => '  ' + modeLabels[compChartMode] + ': ' + fmt(c.raw) } }
            },
            scales: {
                x: { ticks: { color: textColor, callback: v => '$' + (v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'k' : v), font: { family: 'DM Sans', size: 11 } }, grid: { color: gridColor } },
                y: { ticks: { color: textColor, font: { family: 'DM Sans', size: 12, weight: '600' } }, grid: { color: 'transparent' } }
            },
            animation: { duration: 400 }
        }
    });

    // ── Balance over time chart ────────────────────────────────
    const balCtx = document.getElementById('compBalanceChart');
    if (compBalanceChartInstance) compBalanceChartInstance.destroy();

    const maxTerm = Math.max(...results.map(r => r.term));
    const now = new Date();
    const balLabels = Array.from({ length: maxTerm + 1 }, (_, yr) =>
        yr === 0 ? String(now.getFullYear()) : String(now.getFullYear() + yr)
    );

    const datasets = results.map((r, i) => {
        const data = [];
        const periodsPerYear = r.freq === 'weekly' ? 52 : r.freq === 'fortnightly' ? 26 : 12;
        const rate = (r.rate / 100) / periodsPerYear;
        let bal = r.loanAmount;
        for (let yr = 0; yr <= maxTerm; yr++) {
            data.push(yr <= r.term ? Math.max(0, Math.round(bal)) : null);
            for (let p = 0; p < periodsPerYear && yr < r.term; p++) {
                const eff = Math.max(0, bal - (r.offset || 0));
                const interest = eff * rate;
                if (r.repayType === 'io') {
                    bal = bal; // no reduction
                } else {
                    const prin = r.pmt - interest;
                    bal = Math.max(0, bal - prin);
                }
            }
        }
        return {
            label: r.name,
            data,
            borderColor: COLORS[i],
            backgroundColor: 'transparent',
            borderWidth: 2.5,
            tension: 0.3,
            pointRadius: 2,
            spanGaps: false
        };
    });

    compBalanceChartInstance = new Chart(balCtx, {
        type: 'line',
        data: { labels: balLabels, datasets },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: { color: textColor, font: { family: 'DM Sans', size: 12 }, boxWidth: 12, padding: 16, usePointStyle: true } },
                tooltip: { callbacks: { label: c => '  ' + c.dataset.label + ': ' + (c.raw !== null ? fmt(c.raw) : '—') } }
            },
            scales: {
                x: { ticks: { color: textColor, maxTicksLimit: 12, font: { family: 'DM Sans', size: 11 } }, grid: { color: gridColor } },
                y: { ticks: { color: textColor, callback: v => '$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v), font: { family: 'DM Sans', size: 11 } }, grid: { color: gridColor } }
            },
            animation: { duration: 400 }
        }
    });
}

function renderCompSummary(results) {
    const COLORS = ['#0A2540', '#00C896', '#F5A623'];
    const bestInterest = results.reduce((b, r, i) => r.totalInterest < results[b].totalInterest ? i : b, 0);

    const rows = [
        { label: 'Loan Type',            vals: results.map(r => r.loanType.charAt(0).toUpperCase() + r.loanType.slice(1)) },
        { label: 'Repayment Type',        vals: results.map(r => r.repayType === 'pi' ? 'P&amp;I' : 'Interest Only') },
        { label: 'Frequency',             vals: results.map(r => r.freq.charAt(0).toUpperCase() + r.freq.slice(1)) },
        { label: 'Offset Balance',        vals: results.map(r => r.offset > 0 ? fmt(r.offset) : '—') },
        { label: 'Annual Fee',            vals: results.map(r => r.annualFee > 0 ? fmt(r.annualFee) + '/yr' : '—') },
        { label: 'Repayment',             vals: results.map(r => fmt(r.pmt) + (r.freq==='weekly'?'/wk':r.freq==='fortnightly'?'/fn':'/mo')), highlight: true },
        { label: 'Monthly Equivalent',    vals: results.map(r => fmt(r.monthlyEquiv) + '/mo') },
        { label: 'Annual Cost',           vals: results.map(r => fmt(r.monthlyEquiv * 12) + '/yr') },
        { label: 'Total Interest',        vals: results.map(r => fmt(r.totalInterest)), highlight: true, bestIdx: bestInterest },
        { label: 'Total Fees (life)',      vals: results.map(r => r.annualFee > 0 ? fmt(r.annualFees) : '—') },
        { label: 'Total Paid (incl. fees)',vals: results.map(r => fmt(r.totalPaid + r.annualFees)), highlight: true },
        { label: 'vs. Best (interest)',    vals: results.map((r, i) => i === bestInterest ? '✓ Best' : '+' + fmt(r.totalInterest - results[bestInterest].totalInterest)) },
    ];

    const thead = `<thead><tr>
        <th></th>
        ${results.map((r, i) => `<th style="color:${COLORS[i]}">${r.name}</th>`).join('')}
    </tr></thead>`;

    const tbody = `<tbody>${rows.map(row => `
        <tr class="${row.highlight ? 'comp-row-highlight' : ''}">
            <td class="comp-row-label">${row.label}</td>
            ${row.vals.map((v, i) => `<td class="${row.bestIdx === i ? 'comp-best-cell' : ''}">${v}</td>`).join('')}
        </tr>`).join('')}
    </tbody>`;

    document.getElementById('compTable').innerHTML = thead + tbody;
}

function updateLoan(idx, field, value) {
    const STRING_FIELDS = new Set(['name', 'loanType', 'repayType', 'freq']);
    comparisonLoans[idx][field] = STRING_FIELDS.has(field) ? value : (parseFloat(value) || 0);
    renderComparisonGrid();
}
function removeLoan(idx) {
    comparisonLoans.splice(idx, 1);
    renderComparisonGrid();
    document.getElementById('addLoanBtn').style.display = comparisonLoans.length >= 3 ? 'none' : '';
}

// Official government URLs — one per scheme per state
const FHB_SCHEME_URLS = {
    fhog: {
        NSW: 'https://www.revenue.nsw.gov.au/grants-schemes/first-home-buyer/new-homes',
        VIC: 'https://www.sro.vic.gov.au/first-home-owner-grant',
        QLD: 'https://www.qld.gov.au/housing/buying-owning-home/financial-help-concessions/qld-first-home-grant',
        WA:  'https://www.wa.gov.au/organisation/department-of-finance/first-home-owner-grant',
        SA:  'https://www.revenuesa.sa.gov.au/grants-and-concessions/first-home-owners-grant',
        TAS: 'https://www.sro.tas.gov.au/first-home-owner',
        ACT: 'https://www.revenue.act.gov.au/duties/conveyance-duty/home-buyer-concession-scheme',
        NT:  'https://nt.gov.au/employ/money-and-taxes/taxes-royalties-and-grants/first-home-owner-grant',
    },
    duty: {
        NSW: 'https://www.revenue.nsw.gov.au/grants-schemes/first-home-buyer',
        VIC: 'https://www.sro.vic.gov.au/first-home-buyer',
        QLD: 'https://www.qld.gov.au/housing/buying-owning-home/financial-help-concessions/transfer-duty-concessions',
        WA:  'https://www.wa.gov.au/organisation/department-of-finance/first-home-owner-rate-duty',
        SA:  'https://www.revenuesa.sa.gov.au/taxes-and-royalties/stamp-duties',
        TAS: 'https://www.sro.tas.gov.au/duties',
        ACT: 'https://www.revenue.act.gov.au/duties/conveyance-duty/home-buyer-concession-scheme',
        NT:  'https://nt.gov.au/employ/money-and-taxes/taxes-royalties-and-grants/stamp-duty',
    },
    fhss: {
        // Federal scheme — ATO administers, same URL for all states
        ALL: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-your-super/first-home-super-saver-scheme',
    },
    fhg: {
        // Federal — Housing Australia administers
        ALL: 'https://www.housingaustralia.gov.au/support-buy-home/first-home-guarantee',
    },
    htb: {
        // Federal — Help to Buy (pending legislation 2025)
        ALL: 'https://www.housingaustralia.gov.au/support-buy-home/help-buy',
    },
};

// Human-readable link labels per scheme
const FHB_SCHEME_LINK_LABELS = {
    fhog: 'Apply for FHOG at your State Revenue Office',
    duty: 'Check stamp duty concessions at your State Revenue Office',
    fhss: 'FHSS scheme details — ATO',
    fhg:  'First Home Guarantee — Housing Australia',
    htb:  'Help to Buy — Housing Australia',
};

// ─── First Home Buyer Hub ─────────────────────────────────────

// Per-state smart defaults — price chosen to sit just under the best
// available threshold (duty exemption or FHOG cap), type set to unlock FHOG
const FHB_STATE_DEFAULTS = {
    NSW: { price: 790000, propType: 'new',         savings: 39500,  hint: 'Under $800k duty exemption. New build unlocks $10k FHOG.' },
    VIC: { price: 590000, propType: 'new',         savings: 29500,  hint: 'Under $600k full duty exemption. New build unlocks $10k FHOG.' },
    QLD: { price: 580000, propType: 'new',         savings: 29000,  hint: 'Under $700k duty exemption. New build unlocks $30k FHOG.' },
    WA:  { price: 420000, propType: 'new',         savings: 21000,  hint: 'Under $430k full duty exemption. New build eligible for $10k FHOG.' },
    SA:  { price: 550000, propType: 'new',         savings: 27500,  hint: 'No duty concession in SA — new build unlocks $15k FHOG. No price cap.' },
    TAS: { price: 550000, propType: 'new',         savings: 27500,  hint: 'Under $600k for 50% duty concession. New build unlocks $30k FHOG.' },
    ACT: { price: 750000, propType: 'established', savings: 37500,  hint: 'ACT waives all duty under $1M (income-tested). No FHOG — duty concession is the main benefit.' },
    NT:  { price: 550000, propType: 'new',         savings: 27500,  hint: 'Under $650k for 50% duty concession. NT accepts new or established for $10k FHOG.' },
};

function initFHBStateListener() {
    const stateEl = document.getElementById('fhb_state');
    if (!stateEl) return;
    stateEl.addEventListener('change', () => applyFHBStateDefaults(stateEl.value, true));
    // Set initial buyer type state
    updateFHBBuyerType(document.getElementById('fhb_buyers')?.value || 'couple');
}

function updateFHBBuyerType(value) {
    const group  = document.getElementById('fhb_income2Group');
    const input  = document.getElementById('fhb_income2');
    const label  = document.getElementById('fhb_income2Label');
    const isSingle = value === 'single';

    if (!group) return;

    group.classList.toggle('uc-field-disabled', isSingle);
    if (input) input.disabled = isSingle;

    // Update label to match buyer type
    if (label) {
        const labelText = value === 'partners' ? "Partner's Annual Gross Income" : "Co-borrower's Annual Gross Income";
        label.textContent = isSingle ? "Partner's Annual Gross Income" : labelText;
    }
}

function applyFHBStateDefaults(state, showNotice) {
    const d = FHB_STATE_DEFAULTS[state];
    if (!d) return;

    const priceEl    = document.getElementById('fhb_price');
    const typeEl     = document.getElementById('fhb_propertyType');
    const savingsEl  = document.getElementById('fhb_savings');

    if (priceEl)   priceEl.value   = d.price;
    if (typeEl)    typeEl.value    = d.propType;
    if (savingsEl) savingsEl.value = d.savings;

    // Update the savings hint text to reflect the new price
    const savingsHint = savingsEl?.closest('.form-group')?.querySelector('.field-hint');
    if (savingsHint) {
        const pct = ((d.savings / d.price) * 100).toFixed(0);
        savingsHint.textContent = pct + '% of purchase price — minimum for the First Home Guarantee';
    }

    // Show animated notice of what changed
    if (showNotice) {
        let notice = document.getElementById('fhb_stateNotice');
        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'fhb_stateNotice';
            notice.className = 'fhb-state-notice';
            const stateGroup = document.getElementById('fhb_state')?.closest('.form-group');
            if (stateGroup) stateGroup.after(notice);
        }
        notice.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 13.5 13.5 8.5 8.5 1 16"/></svg>
            <span>Defaults updated for <strong>${state}</strong> — ${d.hint}</span>`;
        notice.classList.add('visible');
        clearTimeout(notice._timer);
        notice._timer = setTimeout(() => notice.classList.remove('visible'), 4000);
    }
}

function resetFHB() {
    const state = document.getElementById('fhb_state')?.value || 'QLD';
    applyFHBStateDefaults(state, false);

    // Reset income/FHSS fields to sensible defaults
    const fields = {
        fhb_income1: 85000, fhb_income2: 75000,
        fhb_fhssYears: 3,   fhb_fhssMonthly: 1042,
    };
    Object.entries(fields).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    });
    // Reset buyers to couple and sync partner field
    const buyers = document.getElementById('fhb_buyers');
    if (buyers) { buyers.value = 'couple'; updateFHBBuyerType('couple'); }

    // Hide results, show empty state
    document.getElementById('fhb_results')?.classList.add('hidden');
    document.getElementById('fhb_empty').style.display = '';

    // Flash the notice
    let notice = document.getElementById('fhb_stateNotice');
    if (notice) { notice.classList.remove('visible'); }
}

// FHOG — First Home Owner Grant by state (new builds only unless noted)
// Sources: state revenue offices, 2024-25 data
const FHOG_DATA = {
    NSW: { amount: 10000, newOnly: true,  priceCap: 600000, notes: 'New homes only. Price cap $600k (or $750k for off-the-plan). Must live in property for at least 6 months.' },
    VIC: { amount: 10000, newOnly: true,  priceCap: 750000, notes: 'New homes only (first titled). Regional Victoria: $20,000. Must not have owned property in Australia before.' },
    QLD: { amount: 30000, newOnly: true,  priceCap: 750000, notes: '$30,000 grant for new homes entered into from 20 Nov 2023 to 30 Jun 2025. Extended to 30 Jun 2026 at $15,000. Must be new home.' },
    WA:  { amount: 10000, newOnly: false, priceCap: 0,      notes: 'For new or substantially renovated homes. No price cap in WA.' },
    SA:  { amount: 15000, newOnly: true,  priceCap: 0,      notes: 'New homes only. No price cap. Must be owner-occupier for at least 6 continuous months.' },
    TAS: { amount: 30000, newOnly: true,  priceCap: 0,      notes: '$30,000 for new builds commenced from 1 Apr 2024. Increased from previous $20,000. No price cap.' },
    ACT: { amount: 0,     newOnly: true,  priceCap: 0,      notes: 'ACT abolished FHOG in 2019. The Home Buyer Concession Scheme (stamp duty waiver) applies instead.' },
    NT:  { amount: 10000, newOnly: false, priceCap: 0,      notes: '$10,000 for new or established homes. No price cap in NT.' },
};

// Stamp duty FHB concessions — threshold below which full exemption applies
// Source: state revenue offices 2024-25
const FHB_DUTY_EXEMPTION = {
    NSW: { fullExemptUnder: 800000,  reducedUpTo: 1000000, note: 'Full exemption under $800k. Concessional rate $800k–$1M.' },
    VIC: { fullExemptUnder: 600000,  reducedUpTo: 750000,  note: 'Full exemption under $600k. 50% concession $600k–$750k for PPR.' },
    QLD: { fullExemptUnder: 700000,  reducedUpTo: 800000,  note: 'Full transfer duty exemption under $700k for owner-occupier FHB. Concession $700k–$800k.' },
    WA:  { fullExemptUnder: 430000,  reducedUpTo: 530000,  note: 'Full exemption under $430k. Partial concession $430k–$530k.' },
    SA:  { fullExemptUnder: 0,       reducedUpTo: 0,       note: 'No specific FHB stamp duty concession in SA. Standard rates apply.' },
    TAS: { fullExemptUnder: 0,       reducedUpTo: 600000,  note: '50% concession on properties up to $600k for FHBs.' },
    ACT: { fullExemptUnder: 1000000, reducedUpTo: 1000000, note: 'Full duty waiver under $1M income cap (household income ≤ $160k). Home Buyer Concession Scheme.' },
    NT:  { fullExemptUnder: 0,       reducedUpTo: 650000,  note: 'First Home Owner Discount: 50% off duty on homes ≤ $650k.' },
};

// First Home Guarantee (federal) — buy with 5% deposit, no LMI
const FHG_PRICE_CAPS = {
    NSW: { capital: 900000, regional: 750000 },
    VIC: { capital: 800000, regional: 650000 },
    QLD: { capital: 700000, regional: 550000 },
    WA:  { capital: 600000, regional: 450000 },
    SA:  { capital: 600000, regional: 450000 },
    TAS: { capital: 600000, regional: 450000 },
    ACT: { capital: 750000, regional: 750000 },
    NT:  { capital: 600000, regional: 550000 },
};

// Help to Buy — federal equity co-contribution (pending legislation as of 2025)
// Government contributes up to 40% for new, 30% for established
const HELP_TO_BUY_CAPS = {
    NSW: 950000, VIC: 850000, QLD: 700000, WA: 600000,
    SA: 600000, TAS: 600000, ACT: 750000, NT: 600000
};

function calculateFHB() {
    const state        = document.getElementById('fhb_state').value;
    const price        = parseFloat(document.getElementById('fhb_price').value)       || 0;
    const propType     = document.getElementById('fhb_propertyType').value;
    const buyers       = document.getElementById('fhb_buyers').value;
    const savings      = parseFloat(document.getElementById('fhb_savings').value)      || 0;
    const income1      = parseFloat(document.getElementById('fhb_income1').value)      || 0;
    const income2      = parseFloat(document.getElementById('fhb_income2').value)      || 0;
    const fhssYears    = parseInt(document.getElementById('fhb_fhssYears').value)      || 3;
    const fhssMonthly  = parseFloat(document.getElementById('fhb_fhssMonthly').value)  || 0;

    const isNew     = propType === 'new' || propType === 'vacant';
    const isCouple  = buyers === 'couple' || buyers === 'partners';
    const numBuyers = isCouple ? 2 : 1;

    // ── 1. FHOG ───────────────────────────────────────────────
    const fhog = FHOG_DATA[state];
    let fhogAmount = 0;
    let fhogEligible = false;
    let fhogNote = '';
    if (fhog.amount > 0) {
        const priceOk   = fhog.priceCap === 0 || price <= fhog.priceCap;
        const typeOk    = !fhog.newOnly || isNew;
        fhogEligible    = priceOk && typeOk;
        fhogAmount      = fhogEligible ? fhog.amount : 0;
        fhogNote        = fhog.notes;
        if (!typeOk)    fhogNote = '⚠️ FHOG requires a new home in ' + state + '. ' + fhog.notes;
        if (!priceOk)   fhogNote = '⚠️ Property price exceeds cap of ' + fmt(fhog.priceCap) + '. ' + fhog.notes;
    } else {
        fhogNote = fhog.notes;
    }

    // ── 2. Stamp Duty Concession ─────────────────────────────
    const fullDuty    = estimateStampDuty(state, price);
    const concession  = FHB_DUTY_EXEMPTION[state];
    let dutyPayable   = fullDuty;
    let dutySaving    = 0;
    let dutyNote      = '';
    if (concession.fullExemptUnder > 0 && price <= concession.fullExemptUnder) {
        dutyPayable  = 0;
        dutySaving   = fullDuty;
        dutyNote     = '✓ Full exemption — property under ' + fmt(concession.fullExemptUnder) + ' threshold';
    } else if (concession.reducedUpTo > 0 && price <= concession.reducedUpTo) {
        // Concession: typically 50% or sliding scale — use 50% as indicative
        dutyPayable  = Math.round(fullDuty * 0.5);
        dutySaving   = fullDuty - dutyPayable;
        dutyNote     = '✓ Partial concession applied — ' + concession.note;
    } else {
        dutyNote     = concession.note || 'No concession available at this price in ' + state;
        dutySaving   = 0;
    }

    // ── 3. FHSS — First Home Super Saver ─────────────────────
    // Max $15k/yr, up to $50k total per person
    const annualFHSS      = Math.min(fhssMonthly * 12, 15000);
    const totalFHSSPerPerson = Math.min(annualFHSS * fhssYears, 50000);
    const totalFHSSBoth   = totalFHSSPerPerson * numBuyers;

    // Tax saving: contributions taxed at 15% instead of marginal rate
    // Use calcAustralianTax for marginal rate approximation
    const marginalRate1 = getMarginalRate(income1);
    const marginalRate2 = isCouple ? getMarginalRate(income2) : 0;
    const fhssTaxSaving1 = totalFHSSPerPerson * Math.max(0, marginalRate1 - 0.15);
    const fhssTaxSaving2 = isCouple ? totalFHSSPerPerson * Math.max(0, marginalRate2 - 0.15) : 0;
    const fhssTaxSavingTotal = fhssTaxSaving1 + fhssTaxSaving2;

    // ── 4. First Home Guarantee (5% deposit, no LMI) ─────────
    const fhgCaps         = FHG_PRICE_CAPS[state];
    const fhgCap          = fhgCaps.capital; // use capital city cap (conservative)
    const fhgEligible     = price <= fhgCap;
    const depositNeeded5  = price * 0.05;
    const depositNeeded20 = price * 0.20;
    const lmiSaving       = estimateLMI(price - depositNeeded5, price); // LMI avoided
    const fhgNote         = fhgEligible
        ? '5% minimum deposit (' + fmt(depositNeeded5) + '). Price cap: ' + fmt(fhgCap) + '. Subject to income caps: $125k single / $200k couple.'
        : '⚠️ Price exceeds cap of ' + fmt(fhgCap) + ' for ' + state + '. Standard LMI applies.';

    // ── 5. Help to Buy (equity co-contribution) ───────────────
    const htbCap           = HELP_TO_BUY_CAPS[state];
    const htbEligible      = price <= htbCap;
    const htbPct           = isNew ? 0.40 : 0.30;
    const htbAmount        = htbEligible ? price * htbPct : 0;
    const htbNote          = htbEligible
        ? 'Government co-buys ' + (htbPct * 100).toFixed(0) + '% (' + fmt(htbAmount) + '). ' +
          'You need a ' + (isNew ? '2%' : '2%') + ' min deposit. Income cap: $90k single / $120k couple. ' +
          '<strong>Note: legislation pending Senate approval as of 2025.</strong>'
        : '⚠️ Price exceeds Help to Buy cap of ' + fmt(htbCap) + ' in ' + state + '.';

    // ── 6. Effective deposit ──────────────────────────────────
    const effectiveSavings = savings + fhogAmount + totalFHSSBoth;
    const lvrWithGrants    = price > 0 ? ((price - effectiveSavings) / price * 100).toFixed(1) : 0;
    const depositPct       = price > 0 ? (effectiveSavings / price * 100).toFixed(1) : 0;

    // ── 7. Total monetary benefit ─────────────────────────────
    const totalBenefit = fhogAmount + dutySaving + fhssTaxSavingTotal + (fhgEligible ? lmiSaving : 0);

    // ── Render ────────────────────────────────────────────────
    const r = {
        state, price, isNew, isCouple, numBuyers, savings, income1, income2,
        fhssYears, fhssMonthly, annualFHSS, totalFHSSPerPerson, totalFHSSBoth,
        fhssTaxSavingTotal, fhssTaxSaving1, fhssTaxSaving2, marginalRate1, marginalRate2,
        fhogAmount, fhogEligible, fhogNote,
        fullDuty, dutyPayable, dutySaving, dutyNote,
        fhgEligible, fhgCap, depositNeeded5, depositNeeded20, lmiSaving, fhgNote,
        htbEligible, htbAmount, htbPct, htbNote,
        effectiveSavings, lvrWithGrants, depositPct, totalBenefit
    };
    renderFHBResults(r);
}

function getMarginalRate(income) {
    if (income <= 18200)  return 0;
    if (income <= 45000)  return 0.19;
    if (income <= 120000) return 0.325;
    if (income <= 180000) return 0.37;
    return 0.45;
}

function renderFHBResults(r) {
    document.getElementById('fhb_empty').style.display = 'none';
    document.getElementById('fhb_results').classList.remove('hidden');

    // Hero
    document.getElementById('fhb_totalBenefit').textContent = fmt(r.totalBenefit);
    document.getElementById('fhb_heroSub').textContent =
        'in grants, duty savings, tax benefits & LMI waiver — for a ' + r.price > 0
        ? fmt(r.price) + ' purchase in ' + r.state
        : '';

    // Hero badges
    const badges = [];
    if (r.fhogAmount > 0)           badges.push({ label: 'FHOG', val: fmt(r.fhogAmount), cls: 'fhb-badge--grant' });
    if (r.dutySaving > 0)           badges.push({ label: 'Duty Saved', val: fmt(r.dutySaving), cls: 'fhb-badge--duty' });
    if (r.fhgEligible)              badges.push({ label: 'FHG Eligible', val: 'No LMI', cls: 'fhb-badge--fhg' });
    if (r.totalFHSSBoth > 0)        badges.push({ label: 'FHSS Savings', val: fmt(r.totalFHSSBoth), cls: 'fhb-badge--fhss' });
    if (r.htbEligible)              badges.push({ label: 'Help to Buy', val: fmt(r.htbAmount), cls: 'fhb-badge--htb' });
    document.getElementById('fhb_heroBadges').innerHTML = badges.map(b =>
        `<div class="fhb-badge ${b.cls}"><div class="fhb-badge-val">${b.val}</div><div class="fhb-badge-label">${b.label}</div></div>`
    ).join('');

    // Scheme cards
    const heroSubEl = document.getElementById('fhb_heroSub');
    heroSubEl.textContent = fmt(r.price) + ' purchase in ' + r.state + ' — ' + (r.isCouple ? 'couple' : 'single buyer');

    // Helper — pick the right URL for a scheme + state
    const getSchemeUrl = (schemeId, state) => {
        const map = FHB_SCHEME_URLS[schemeId];
        if (!map) return null;
        return map[state] || map['ALL'] || null;
    };
    const schemeLink = (schemeId, state) => {
        const url = getSchemeUrl(schemeId, state);
        if (!url) return '';
        const label = FHB_SCHEME_LINK_LABELS[schemeId] || 'Official information';
        return `<a href="${url}" target="_blank" rel="noopener" class="fhb-scheme-link">
            ${label}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>`;
    };

    const schemes = [
        {
            id: 'fhog',
            icon: '🏠',
            title: 'First Home Owner Grant (FHOG)',
            amount: r.fhogAmount,
            eligible: r.fhogEligible && r.fhogAmount > 0,
            ineligible: FHOG_DATA[r.state].amount === 0,
            detail: `<div class="fhb-scheme-amount ${r.fhogEligible && r.fhogAmount > 0 ? 'eligible' : 'ineligible'}">${r.fhogAmount > 0 ? fmt(r.fhogAmount) : r.fhogEligible ? 'Not available' : 'Not eligible'}</div>
                <p class="fhb-scheme-note">${r.fhogNote}</p>
                <div class="fhb-scheme-rows">
                    <div class="fhb-scheme-row"><span>Grant amount</span><strong>${fmt(FHOG_DATA[r.state].amount)}</strong></div>
                    <div class="fhb-scheme-row"><span>New builds only</span><strong>${FHOG_DATA[r.state].newOnly ? 'Yes' : 'No'}</strong></div>
                    ${FHOG_DATA[r.state].priceCap > 0 ? `<div class="fhb-scheme-row"><span>Price cap</span><strong>${fmt(FHOG_DATA[r.state].priceCap)}</strong></div>` : ''}
                </div>
                ${schemeLink('fhog', r.state)}`
        },
        {
            id: 'duty',
            icon: '📄',
            title: 'Stamp Duty Concession',
            amount: r.dutySaving,
            eligible: r.dutySaving > 0,
            detail: `<div class="fhb-scheme-amount ${r.dutySaving > 0 ? 'eligible' : 'partial'}">${r.dutySaving > 0 ? fmt(r.dutySaving) + ' saved' : 'Standard duty applies'}</div>
                <p class="fhb-scheme-note">${r.dutyNote}</p>
                <div class="fhb-scheme-rows">
                    <div class="fhb-scheme-row"><span>Standard duty</span><strong>${fmt(r.fullDuty)}</strong></div>
                    <div class="fhb-scheme-row"><span>Duty payable</span><strong>${fmt(r.dutyPayable)}</strong></div>
                    <div class="fhb-scheme-row saving-row"><span>You save</span><strong>${fmt(r.dutySaving)}</strong></div>
                    ${FHB_DUTY_EXEMPTION[r.state].fullExemptUnder > 0 ? `<div class="fhb-scheme-row"><span>Full exemption under</span><strong>${fmt(FHB_DUTY_EXEMPTION[r.state].fullExemptUnder)}</strong></div>` : ''}
                </div>
                ${schemeLink('duty', r.state)}`
        },
        {
            id: 'fhss',
            icon: '🦘',
            title: 'First Home Super Saver (FHSS)',
            amount: r.fhssTaxSavingTotal,
            eligible: true,
            detail: `<div class="fhb-scheme-amount eligible">${fmt(r.totalFHSSBoth)} withdrawable</div>
                <p class="fhb-scheme-note">Save inside super at 15% tax instead of your ${(r.marginalRate1 * 100).toFixed(0)}% marginal rate. Withdraw up to $50,000 per person at settlement.</p>
                <div class="fhb-scheme-rows">
                    <div class="fhb-scheme-row"><span>Monthly contribution</span><strong>${fmt(r.fhssMonthly)}/mo</strong></div>
                    <div class="fhb-scheme-row"><span>Annual FHSS eligible</span><strong>${fmt(r.annualFHSS)}/yr</strong></div>
                    <div class="fhb-scheme-row"><span>Your FHSS savings (${r.fhssYears}yr)</span><strong>${fmt(r.totalFHSSPerPerson)}</strong></div>
                    ${r.isCouple ? `<div class="fhb-scheme-row"><span>Partner FHSS savings</span><strong>${fmt(r.totalFHSSPerPerson)}</strong></div>` : ''}
                    <div class="fhb-scheme-row"><span>Total withdrawable</span><strong>${fmt(r.totalFHSSBoth)}</strong></div>
                    <div class="fhb-scheme-row saving-row"><span>Tax saving (vs marginal rate)</span><strong>${fmt(r.fhssTaxSavingTotal)}</strong></div>
                </div>
                <small class="fhb-scheme-fine">You must apply to the ATO to release FHSS amounts before signing contracts. A 30% FHSS withholding tax applies on withdrawal (offset against your tax return).</small>
                ${schemeLink('fhss', r.state)}`
        },
        {
            id: 'fhg',
            icon: '🛡️',
            title: 'First Home Guarantee (5% Deposit)',
            amount: r.fhgEligible ? r.lmiSaving : 0,
            eligible: r.fhgEligible,
            detail: `<div class="fhb-scheme-amount ${r.fhgEligible ? 'eligible' : 'ineligible'}">${r.fhgEligible ? 'LMI waived (~' + fmt(r.lmiSaving) + ')' : 'Not eligible at this price'}</div>
                <p class="fhb-scheme-note">${r.fhgNote}</p>
                <div class="fhb-scheme-rows">
                    <div class="fhb-scheme-row"><span>Minimum deposit (5%)</span><strong>${fmt(r.depositNeeded5)}</strong></div>
                    <div class="fhb-scheme-row"><span>Standard 20% deposit needed</span><strong>${fmt(r.depositNeeded20)}</strong></div>
                    <div class="fhb-scheme-row saving-row"><span>LMI you avoid</span><strong>${fmt(r.lmiSaving)}</strong></div>
                    <div class="fhb-scheme-row"><span>Price cap (${r.state} capital)</span><strong>${fmt(FHG_PRICE_CAPS[r.state].capital)}</strong></div>
                    <div class="fhb-scheme-row"><span>10,000 places per year</span><strong>Limited spots</strong></div>
                </div>
                <small class="fhb-scheme-fine">Administered by Housing Australia. Apply through a participating lender. Income caps: $125,000 single / $200,000 couple (combined). Property must be owner-occupied.</small>
                ${schemeLink('fhg', r.state)}`
        },
        {
            id: 'htb',
            icon: '🤝',
            title: 'Help to Buy (Equity Co-contribution)',
            amount: r.htbEligible ? r.htbAmount : 0,
            eligible: r.htbEligible,
            detail: `<div class="fhb-scheme-amount ${r.htbEligible ? 'eligible' : 'ineligible'}">${r.htbEligible ? 'Govt contributes ' + fmt(r.htbAmount) : 'Not eligible at this price'}</div>
                <p class="fhb-scheme-note">${r.htbNote}</p>
                ${r.htbEligible ? `<div class="fhb-scheme-rows">
                    <div class="fhb-scheme-row"><span>Government share</span><strong>${(r.htbPct * 100).toFixed(0)}% (${r.isNew ? 'new build' : 'established'})</strong></div>
                    <div class="fhb-scheme-row"><span>Govt contribution</span><strong>${fmt(r.htbAmount)}</strong></div>
                    <div class="fhb-scheme-row"><span>Your loan amount</span><strong>${fmt(r.price * (1 - r.htbPct) - r.price * 0.02)}</strong></div>
                    <div class="fhb-scheme-row"><span>Min deposit required</span><strong>${fmt(r.price * 0.02)} (2%)</strong></div>
                    <div class="fhb-scheme-row"><span>Price cap (${r.state})</span><strong>${fmt(HELP_TO_BUY_CAPS[r.state])}</strong></div>
                </div>` : ''}
                <small class="fhb-scheme-fine">Income cap: $90,000 single / $120,000 couple. Legislation passed lower house; pending Senate. Government retains proportional stake — share must be bought back when selling or refinancing.</small>
                ${schemeLink('htb', r.state)}`
        }
    ];

    document.getElementById('fhb_schemesGrid').innerHTML = schemes.map(s => `
        <div class="fhb-scheme-card ${s.eligible ? 'fhb-eligible' : 'fhb-ineligible'}" id="fhb_scheme_${s.id}">
            <div class="fhb-scheme-header">
                <span class="fhb-scheme-icon">${s.icon}</span>
                <div class="fhb-scheme-title-wrap">
                    <h4 class="fhb-scheme-title">${s.title}</h4>
                    <span class="fhb-scheme-status ${s.eligible ? 'status-eligible' : 'status-ineligible'}">${s.eligible ? '✓ Eligible' : '✗ Not eligible'}</span>
                </div>
                <button class="fhb-scheme-toggle" onclick="toggleFHBScheme('${s.id}')" aria-expanded="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
            </div>
            <div class="fhb-scheme-body" id="fhb_body_${s.id}">
                ${s.detail}
            </div>
        </div>
    `).join('');

    // Deposit summary
    const depositEl = document.getElementById('fhb_depositSummary');
    const depositPct = parseFloat(r.depositPct);
    const depositStatus = depositPct >= 20 ? 'strong' : depositPct >= 10 ? 'moderate' : depositPct >= 5 ? 'minimum' : 'low';
    const depositMessages = { strong: 'No LMI needed. Excellent position.', moderate: 'Strong deposit. Avoid LMI with the First Home Guarantee.', minimum: 'Eligible for First Home Guarantee (5% scheme). LMI waived.', low: 'Consider FHSS to boost savings before purchasing.' };
    depositEl.innerHTML = `
        <div class="fhb-deposit-header">Effective Deposit Position</div>
        <div class="fhb-deposit-bar-wrap">
            <div class="fhb-deposit-bar">
                <div class="fhb-deposit-fill fhb-deposit-${depositStatus}" style="width:${Math.min(100, depositPct)}%"></div>
                <div class="fhb-deposit-marker" style="left:5%"><span>5%</span></div>
                <div class="fhb-deposit-marker" style="left:10%"><span>10%</span></div>
                <div class="fhb-deposit-marker" style="left:20%"><span>20%</span></div>
            </div>
        </div>
        <div class="fhb-deposit-stats">
            <div class="fhb-deposit-stat">
                <span>Your savings</span><strong>${fmt(r.savings)}</strong>
            </div>
            <div class="fhb-deposit-stat">
                <span>+ FHOG grant</span><strong>${fmt(r.fhogAmount)}</strong>
            </div>
            <div class="fhb-deposit-stat">
                <span>+ FHSS withdrawal</span><strong>${fmt(r.totalFHSSBoth)}</strong>
            </div>
            <div class="fhb-deposit-stat fhb-deposit-total">
                <span>Effective deposit</span><strong>${fmt(r.effectiveSavings)} (${r.depositPct}%)</strong>
            </div>
        </div>
        <div class="fhb-deposit-message fhb-deposit-msg-${depositStatus}">${depositMessages[depositStatus]}</div>
    `;

    // Eligibility checklist
    const checks = [
        { ok: true,  text: 'Australian citizen or permanent resident' },
        { ok: true,  text: 'Individual(s) aged 18 or over' },
        { ok: null,  text: 'Never owned property in Australia before (all buyers) — applies to FHOG, FHG, FHSS' },
        { ok: null,  text: 'Intend to live in the property as principal place of residence for at least 6 months within 12 months of settlement' },
        { ok: r.income1 <= 125000,  text: 'Income under $125,000 single / $200,000 couple (FHG income cap)' },
        { ok: r.income1 <= 90000,   text: 'Income under $90,000 single / $120,000 couple (Help to Buy income cap)' },
        { ok: r.fhgEligible,        text: 'Property price under First Home Guarantee cap (' + fmt(FHG_PRICE_CAPS[r.state].capital) + ' in ' + r.state + ')' },
        { ok: r.fhogEligible || FHOG_DATA[r.state].amount === 0, text: 'Property meets FHOG requirements (new build and/or price cap)' },
    ];
    document.getElementById('fhb_checklist').innerHTML = checks.map(c => `
        <li class="fhb-check-item fhb-check-${c.ok === true ? 'pass' : c.ok === false ? 'fail' : 'unknown'}">
            <span class="fhb-check-icon">${c.ok === true ? '✓' : c.ok === false ? '✗' : '?'}</span>
            <span>${c.text}</span>
        </li>`
    ).join('');
}

function toggleFHBScheme(id) {
    const body = document.getElementById('fhb_body_' + id);
    const btn  = document.querySelector('#fhb_scheme_' + id + ' .fhb-scheme-toggle');
    if (!body) return;
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : '';
    if (btn) btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    const chevron = btn?.querySelector('svg');
    if (chevron) chevron.style.transform = open ? 'rotate(-90deg)' : 'rotate(0)';
}

// ─── Rate Watch ───────────────────────────────────────────────

let rw_chartMode  = 'repayment';
let rw_lastResult = null;

// RBA historical context bands
const RBA_CONTEXT = [
    { era: 'GFC low',       year: '2009',    rate: 3.00 },
    { era: 'Post-GFC high', year: '2010',    rate: 4.75 },
    { era: 'Pre-COVID',     year: '2019',    rate: 1.50 },
    { era: 'COVID low',     year: '2020–21', rate: 0.10 },
    { era: '2022–23 peak',  year: '2023',    rate: 4.35 },
    { era: 'Current',       year: '2025',    rate: 4.10 },
];

function calcRepayment(balance, annualRate, termYears, periodsPerYear) {
    const r = (annualRate / 100) / periodsPerYear;
    const n = termYears * periodsPerYear;
    if (r <= 0) return balance / n;
    return balance * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function calcTotalInterest(balance, annualRate, termYears, periodsPerYear) {
    const pmt = calcRepayment(balance, annualRate, termYears, periodsPerYear);
    return pmt * termYears * periodsPerYear - balance;
}

function switchRWChart(mode, btn) {
    rw_chartMode = mode;
    document.querySelectorAll('.rw-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (rw_lastResult) renderRWScenarioChart(rw_lastResult);
}

function calculateRateWatch() {
    const balance      = parseFloat(document.getElementById('rw_loanBalance').value)    || 0;
    const currentRate  = parseFloat(document.getElementById('rw_currentRate').value)    || 0;
    const remainingTerm= parseInt(document.getElementById('rw_remainingTerm').value)    || 30;
    const freqSel      = document.getElementById('rw_repaymentFreq').value;
    const annualIncome = parseFloat(document.getElementById('rw_annualIncome').value)   || 0;
    const fixedRate    = parseFloat(document.getElementById('rw_fixedRate').value)      || 0;
    const fixedTerm    = parseInt(document.getElementById('rw_fixedTerm').value)        || 3;
    const breakCost    = parseFloat(document.getElementById('rw_breakCost').value)      || 0;

    const periodsPerYear = freqSel === 'weekly' ? 52 : freqSel === 'fortnightly' ? 26 : 12;
    const freqLabel      = freqSel === 'weekly' ? '/wk' : freqSel === 'fortnightly' ? '/fn' : '/mo';

    // ── Rate scenarios: -2% to +3% in 0.25 steps ─────────────
    const scenarios = [];
    for (let delta = -2.00; delta <= 3.00; delta = Math.round((delta + 0.25) * 100) / 100) {
        const rate = Math.max(0.01, currentRate + delta);
        const pmt  = calcRepayment(balance, rate, remainingTerm, periodsPerYear);
        const totalInt = calcTotalInterest(balance, rate, remainingTerm, periodsPerYear);
        const annualCost = pmt * periodsPerYear;
        const currentPmt = calcRepayment(balance, currentRate, remainingTerm, periodsPerYear);
        scenarios.push({
            delta, rate, pmt, totalInt, annualCost,
            pmtDiff:   pmt - currentPmt,
            isCurrentRate: Math.abs(delta) < 0.001,
        });
    }

    const currentPmt    = calcRepayment(balance, currentRate, remainingTerm, periodsPerYear);
    const currentAnnual = currentPmt * periodsPerYear;
    const currentTotalI = calcTotalInterest(balance, currentRate, remainingTerm, periodsPerYear);

    // ── Fixed vs Variable cumulative cost ─────────────────────
    // Over the fixed term, compare cumulative payments at fixed rate vs variable at each RBA scenario
    const fixedPmt = calcRepayment(balance, fixedRate, remainingTerm, periodsPerYear);
    const fixedPeriods = fixedTerm * periodsPerYear;

    // Simulate month-by-month cumulative cost for fixed and 3 variable paths
    const varPaths = [
        { label: 'Var: -0.5%',  rate: Math.max(0.01, currentRate - 0.5),  color: '#00C896', dash: [] },
        { label: 'Var: current', rate: currentRate,                         color: '#0A2540', dash: [] },
        { label: 'Var: +0.5%',  rate: Math.max(0.01, currentRate + 0.5),  color: '#F5A623', dash: [] },
        { label: 'Var: +1.0%',  rate: Math.max(0.01, currentRate + 1.0),  color: '#E24B4A', dash: [5,3] },
    ];

    const fvLabels = Array.from({ length: fixedPeriods + 1 }, (_, i) => {
        if (periodsPerYear === 12) return i === 0 ? 'Now' : 'Mo ' + i;
        if (periodsPerYear === 26) return i === 0 ? 'Now' : 'Fn ' + i;
        return i === 0 ? 'Now' : 'Wk ' + i;
    }).filter((_, i) => i % Math.ceil(fixedPeriods / 24) === 0 || i === fixedPeriods);

    // Thin out labels for chart readability (max 25 points)
    const step = Math.ceil(fixedPeriods / 24);
    const fvLabelsFull = [];
    for (let i = 0; i <= fixedPeriods; i += step) fvLabelsFull.push(i);
    if (fvLabelsFull[fvLabelsFull.length - 1] !== fixedPeriods) fvLabelsFull.push(fixedPeriods);

    const fvFixed = fvLabelsFull.map(i => Math.round((fixedPmt + breakCost / fixedPeriods) * i));
    const fvVarDatasets = varPaths.map(vp => ({
        ...vp,
        data: fvLabelsFull.map(i => Math.round(calcRepayment(balance, vp.rate, remainingTerm, periodsPerYear) * i))
    }));

    const fvXLabels = fvLabelsFull.map(i => {
        if (i === 0) return 'Now';
        if (periodsPerYear === 12) return 'Mo ' + i;
        if (periodsPerYear === 26) return 'Fn ' + i;
        return 'Wk ' + i;
    });

    // Break-even points — where does variable cumulative cost cross fixed?
    const fvBreakEvens = varPaths.map(vp => {
        const varPmt = calcRepayment(balance, vp.rate, remainingTerm, periodsPerYear);
        const fixPmtTotal = fixedPmt + breakCost / fixedPeriods;
        if (varPmt <= fixPmtTotal) return { label: vp.label, period: 0, note: 'Var always cheaper' };
        if (varPmt >= fixPmtTotal) {
            // Find exact break-even
            for (let i = 1; i <= fixedPeriods; i++) {
                const fixedCum = fixPmtTotal * i;
                const varCum   = varPmt * i;
                if (varCum > fixedCum) {
                    return { label: vp.label, period: i, note: 'Fixed saves money up to period ' + i };
                }
            }
            return { label: vp.label, period: fixedPeriods, note: 'Fixed cheaper throughout fixed term' };
        }
        return { label: vp.label, period: null, note: '—' };
    });

    // Savings if fixed vs current variable over fixed term
    const fixedTermCost    = fixedPmt * fixedPeriods + breakCost;
    const varTermCost      = currentPmt * fixedPeriods;
    const fixedVsVarSaving = varTermCost - fixedTermCost;

    // ── Stress test — at what rate does loan become unserviceable? ─
    // Use 35% of net income as max repayment (lender DSR threshold)
    const monthlyNetIncome   = annualIncome > 0 ? (annualIncome * 0.72) / 12 : 0;
    const maxMonthlyRepayment = monthlyNetIncome * 0.35;
    const maxAnnualRepayment  = maxMonthlyRepayment * 12;

    // Find rate at which monthly repayment = maxMonthlyRepayment
    let stressRate = currentRate;
    if (annualIncome > 0) {
        for (let r = 0; r <= 20; r += 0.01) {
            const pmt = calcRepayment(balance, r, remainingTerm, 12);
            if (pmt > maxMonthlyRepayment) { stressRate = r; break; }
        }
    }
    const stressHeadroom = stressRate - currentRate;
    const stressScenarios = [];
    for (let r = Math.max(0.5, currentRate - 1); r <= Math.min(20, stressRate + 2); r = Math.round((r + 0.5) * 10) / 10) {
        stressScenarios.push({ rate: r, pmt: calcRepayment(balance, r, remainingTerm, 12) });
    }

    const result = {
        balance, currentRate, remainingTerm, periodsPerYear, freqLabel,
        annualIncome, fixedRate, fixedTerm, breakCost,
        currentPmt, currentAnnual, currentTotalI,
        scenarios, fixedPmt, fixedPeriods, fixedTermCost, varTermCost, fixedVsVarSaving,
        fvXLabels, fvFixed, fvVarDatasets, fvBreakEvens,
        stressRate, stressHeadroom, maxMonthlyRepayment, stressScenarios,
        monthlyNetIncome
    };

    rw_lastResult = result;
    renderRWResults(result);
}

function renderRWResults(r) {
    document.getElementById('rw_empty').style.display = 'none';
    document.getElementById('rw_results').classList.remove('hidden');

    // ── KPIs ──────────────────────────────────────────────────
    const ratePlus1  = calcRepayment(r.balance, r.currentRate + 1,   r.remainingTerm, r.periodsPerYear);
    const rateMinus1 = calcRepayment(r.balance, Math.max(0.01, r.currentRate - 1), r.remainingTerm, r.periodsPerYear);
    const kpis = [
        { label: 'Current Repayment',    value: fmt(r.currentPmt) + r.freqLabel,  sub: 'at ' + r.currentRate + '% variable',  primary: true  },
        { label: '+1% Rate Rise',        value: fmt(ratePlus1)    + r.freqLabel,  sub: '+' + fmt(ratePlus1 - r.currentPmt) + r.freqLabel + ' more', primary: false },
        { label: '−1% Rate Cut',         value: fmt(rateMinus1)   + r.freqLabel,  sub: fmt(r.currentPmt - rateMinus1) + r.freqLabel + ' saving',    primary: false },
        { label: 'Fixed Repayment',      value: fmt(r.fixedPmt)   + r.freqLabel,  sub: r.fixedRate + '% fixed for ' + r.fixedTerm + ' yrs',        primary: false },
        { label: 'Fixed vs Var (term)',  value: (r.fixedVsVarSaving >= 0 ? 'Save ' : 'Cost ') + fmt(Math.abs(r.fixedVsVarSaving)), sub: 'over ' + r.fixedTerm + '-yr fixed period', primary: false },
        { label: 'Stress Rate',          value: r.annualIncome > 0 ? r.stressRate.toFixed(2) + '%' : 'Enter income',
          sub: r.annualIncome > 0 ? '+' + r.stressHeadroom.toFixed(2) + '% headroom from current' : 'for stress test', primary: false },
    ];
    document.getElementById('rw_kpiStrip').innerHTML = kpis.map(k => `
        <div class="metric-tile ${k.primary ? 'metric-primary' : ''}">
            <div class="metric-label">${k.label}</div>
            <div class="metric-value">${k.value}</div>
            <div class="metric-sub">${k.sub}</div>
        </div>`).join('');

    renderRWScenarioChart(r);
    renderRWScenarioTable(r);
    renderRWFVChart(r);
    renderRWFVSummary(r);
    renderRWStressChart(r);
    renderRWBreakEvenGrid(r);
}

function renderRWScenarioChart(r) {
    const isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#8CA4BB' : '#8896A9';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    const labels = r.scenarios.map(s => (s.delta >= 0 ? '+' : '') + s.delta.toFixed(2) + '%');
    let data, yLabel, tooltipFmt;
    if (rw_chartMode === 'totalinterest') {
        data = r.scenarios.map(s => Math.round(s.totalInt));
        yLabel = 'Total Interest';
        tooltipFmt = v => fmt(v);
    } else if (rw_chartMode === 'annualcost') {
        data = r.scenarios.map(s => Math.round(s.annualCost));
        yLabel = 'Annual Cost';
        tooltipFmt = v => fmt(v) + '/yr';
    } else {
        data = r.scenarios.map(s => s.pmt);
        yLabel = 'Repayment';
        tooltipFmt = v => fmt(v) + r.freqLabel;
    }

    const colors = r.scenarios.map(s =>
        s.isCurrentRate   ? '#0A2540'
        : s.delta < 0     ? '#00C896'
        : s.delta <= 0.5  ? '#F5A623'
        : s.delta <= 1.0  ? '#E24B4A'
        : '#8B0000'
    );

    const ctx = document.getElementById('rw_scenarioChart');
    if (rw_scenarioChartInstance) rw_scenarioChartInstance.destroy();
    rw_scenarioChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: yLabel,
                data,
                backgroundColor: colors,
                borderRadius: 6,
                borderWidth: 0,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => 'Rate change: ' + items[0].label,
                        label: (c) => '  ' + yLabel + ': ' + tooltipFmt(c.raw),
                        afterLabel: (c) => {
                            const s = r.scenarios[c.dataIndex];
                            return '  Rate: ' + s.rate.toFixed(2) + '%  |  Diff: ' + (s.pmtDiff >= 0 ? '+' : '') + fmt(s.pmtDiff) + r.freqLabel;
                        }
                    }
                },
                annotation: { annotations: {} }
            },
            scales: {
                x: { ticks: { color: textColor, font: { family: 'DM Sans', size: 11 } }, grid: { color: gridColor } },
                y: {
                    ticks: { color: textColor, callback: v => '$' + (v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'k' : v), font: { family: 'DM Sans', size: 11 } },
                    grid: { color: gridColor }
                }
            },
            animation: { duration: 500 }
        }
    });
}

function renderRWScenarioTable(r) {
    const rows = r.scenarios.filter(s => s.delta % 0.25 === 0 || s.isCurrentRate);
    const thead = `<thead><tr>
        <th>Rate Change</th><th>New Rate</th><th>Repayment</th><th>vs Current</th><th>Annual Cost</th><th>Total Interest</th>
    </tr></thead>`;
    const tbody = `<tbody>${rows.map(s => `
        <tr class="${s.isCurrentRate ? 'rw-current-row' : ''}">
            <td>${s.isCurrentRate ? '<span class="rw-current-badge">Current</span>' : (s.delta >= 0 ? '+' : '') + s.delta.toFixed(2) + '%'}</td>
            <td>${s.rate.toFixed(2)}%</td>
            <td><strong>${fmt(s.pmt)}${r.freqLabel}</strong></td>
            <td class="${s.pmtDiff > 0 ? 'rw-val-up' : s.pmtDiff < 0 ? 'rw-val-down' : ''}">${s.pmtDiff === 0 ? '—' : (s.pmtDiff > 0 ? '+' : '') + fmt(s.pmtDiff) + r.freqLabel}</td>
            <td>${fmt(s.annualCost)}/yr</td>
            <td>${fmt(s.totalInt)}</td>
        </tr>`).join('')}
    </tbody>`;
    document.getElementById('rw_scenarioTable').innerHTML = thead + tbody;
}

function renderRWFVChart(r) {
    const isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#8CA4BB' : '#8896A9';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    const datasets = [
        {
            label: 'Fixed (' + r.fixedRate + '%)' + (r.breakCost > 0 ? ' + break cost' : ''),
            data: r.fvFixed,
            borderColor: '#2563EB',
            backgroundColor: 'transparent',
            borderWidth: 3,
            borderDash: [],
            pointRadius: 0,
            tension: 0.2
        },
        ...r.fvVarDatasets.map(vp => ({
            label: vp.label,
            data: vp.data,
            borderColor: vp.color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: vp.dash,
            pointRadius: 0,
            tension: 0.2
        }))
    ];

    const ctx = document.getElementById('rw_fvChart');
    if (rw_fvChartInstance) rw_fvChartInstance.destroy();
    rw_fvChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: r.fvXLabels, datasets },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: { color: textColor, font: { family: 'DM Sans', size: 12 }, boxWidth: 12, padding: 14, usePointStyle: true } },
                tooltip: { callbacks: { label: c => '  ' + c.dataset.label + ': ' + fmt(c.raw) } }
            },
            scales: {
                x: { ticks: { color: textColor, maxTicksLimit: 12, font: { family: 'DM Sans', size: 11 } }, grid: { color: gridColor } },
                y: { ticks: { color: textColor, callback: v => '$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v), font: { family: 'DM Sans', size: 11 } }, grid: { color: gridColor } }
            },
            animation: { duration: 500 }
        }
    });
}

function renderRWFVSummary(r) {
    const cheaper  = r.fixedVsVarSaving > 0;
    const saving   = Math.abs(r.fixedVsVarSaving);
    const statusCls = cheaper ? 'rw-fv-fixed-wins' : 'rw-fv-var-wins';
    const statusMsg = cheaper
        ? `Fixed saves ${fmt(saving)} vs current variable over ${r.fixedTerm} years`
        : `Variable is ${fmt(saving)} cheaper over ${r.fixedTerm} years at current rate`;

    const html = `
        <div class="rw-fv-verdict ${statusCls}">
            <span class="rw-fv-icon">${cheaper ? '🔒' : '📉'}</span>
            <strong>${statusMsg}</strong>
        </div>
        <div class="rw-fv-breakdown">
            <div class="rw-fv-row"><span>Fixed total cost (${r.fixedTerm} yrs)</span><strong>${fmt(r.fixedTermCost)}</strong></div>
            <div class="rw-fv-row"><span>Variable total cost at current rate</span><strong>${fmt(r.varTermCost)}</strong></div>
            ${r.breakCost > 0 ? `<div class="rw-fv-row"><span>Break cost included</span><strong>${fmt(r.breakCost)}</strong></div>` : ''}
            <div class="rw-fv-row rw-fv-row--total"><span>${cheaper ? 'Fixed saves' : 'Variable saves'}</span><strong class="${cheaper ? 'rw-val-down' : 'rw-val-up'}">${fmt(saving)}</strong></div>
        </div>
        <div class="rw-fv-breaks">
            <div class="rw-fv-breaks-label">Break-even — when does variable become cheaper?</div>
            ${r.fvBreakEvens.map(be => `
                <div class="rw-fv-be-row">
                    <span>${be.label}</span>
                    <span class="rw-fv-be-note">${be.note}</span>
                </div>`).join('')}
        </div>`;
    document.getElementById('rw_fvSummary').innerHTML = html;
}

function renderRWStressChart(r) {
    if (!r.annualIncome) { document.getElementById('rw_stressSummary').innerHTML = '<p class="rw-no-data">Enter annual income to see stress test</p>'; return; }
    const isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#8CA4BB' : '#8896A9';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    const labels = r.stressScenarios.map(s => s.rate.toFixed(1) + '%');
    const pmts   = r.stressScenarios.map(s => Math.round(s.pmt));
    const maxLine = r.stressScenarios.map(() => Math.round(r.maxMonthlyRepayment));
    const colors = r.stressScenarios.map(s => s.pmt > r.maxMonthlyRepayment ? '#E24B4A' : s.rate <= r.currentRate ? '#00C896' : '#F5A623');

    const ctx = document.getElementById('rw_stressChart');
    if (rw_stressChartInstance) rw_stressChartInstance.destroy();
    rw_stressChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Monthly repayment', data: pmts, backgroundColor: colors, borderRadius: 4, borderWidth: 0 },
                { label: '35% income limit', data: maxLine, type: 'line', borderColor: '#E24B4A', borderWidth: 2, borderDash: [5,3], pointRadius: 0, backgroundColor: 'transparent' }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true, position: 'top', labels: { color: textColor, font: { family: 'DM Sans', size: 11 }, boxWidth: 10, padding: 10 } },
                tooltip: { callbacks: { label: c => '  ' + c.dataset.label + ': ' + fmt(c.raw) + '/mo' } }
            },
            scales: {
                x: { ticks: { color: textColor, font: { family: 'DM Sans', size: 10 } }, grid: { color: gridColor } },
                y: { ticks: { color: textColor, callback: v => '$' + (v/1000).toFixed(0) + 'k', font: { family: 'DM Sans', size: 10 } }, grid: { color: gridColor } }
            },
            animation: { duration: 400 }
        }
    });

    const headroom = r.stressRate - r.currentRate;
    const headroomCls = headroom > 2 ? 'rw-val-down' : headroom > 1 ? 'rw-val-amber' : 'rw-val-up';
    document.getElementById('rw_stressSummary').innerHTML = `
        <div class="rw-stress-grid">
            <div class="rw-stress-row"><span>Max monthly repayment (35% net income)</span><strong>${fmt(r.maxMonthlyRepayment)}/mo</strong></div>
            <div class="rw-stress-row"><span>Rate where loan becomes unserviceable</span><strong class="${headroomCls}">${r.stressRate.toFixed(2)}%</strong></div>
            <div class="rw-stress-row"><span>Rate headroom from current</span><strong class="${headroomCls}">+${headroom.toFixed(2)}%</strong></div>
            <div class="rw-stress-row"><span>APRA buffer applies at</span><strong>${(r.currentRate + 3).toFixed(2)}%</strong></div>
        </div>`;
}

function renderRWBreakEvenGrid(r) {
    // Show what the variable rate would need to do (in RBA 0.25% moves) to match fixed
    const fixedMonthlyCost = calcRepayment(r.balance, r.fixedRate, r.remainingTerm, 12) + r.breakCost / (r.fixedTerm * 12);
    const scenarios = [];
    for (let cuts = 0; cuts <= 8; cuts++) {
        const varRate  = Math.max(0.01, r.currentRate - cuts * 0.25);
        const varPmt   = calcRepayment(r.balance, varRate, r.remainingTerm, 12);
        const saving   = fixedMonthlyCost - varPmt;
        scenarios.push({ cuts, varRate, varPmt, fixedMonthlyCost, saving });
    }

    document.getElementById('rw_breakEvenGrid').innerHTML = `
        <div class="rw-be-note">Each row = one more 0.25% RBA cut</div>
        <table class="rw-be-table">
            <thead><tr><th>RBA Cuts</th><th>Var Rate</th><th>Var Repmt /mo</th><th>Fixed /mo</th><th>Var saves</th></tr></thead>
            <tbody>${scenarios.map(s => `
                <tr class="${s.saving >= 0 ? 'rw-be-win' : ''}">
                    <td>${s.cuts === 0 ? 'No cuts' : s.cuts + ' × 0.25%'}</td>
                    <td>${s.varRate.toFixed(2)}%</td>
                    <td>${fmt(s.varPmt)}/mo</td>
                    <td>${fmt(s.fixedMonthlyCost)}/mo</td>
                    <td class="${s.saving >= 0 ? 'rw-val-down' : 'rw-val-up'}">${s.saving >= 0 ? '+' : ''}${fmt(s.saving)}/mo</td>
                </tr>`).join('')}
            </tbody>
        </table>
        <p class="rw-be-footer">Green rows = variable cheaper than fixed at that cut count</p>`;
}

// ─── Quick nav to Stamp Duty tab ─────────────────────────────
function switchToStampDuty(e) {
    e.preventDefault();
    const btn = document.querySelector('[data-tab="stamp-duty"]');
    if (btn) btn.click();
}

// ─── RBA Rate Check ───────────────────────────────────────────
function fetchRBA() {
    // RBA cash rate as of early 2025: 4.10%
    // Typical variable mortgage spread: ~2.0–2.5% above cash rate
    const RBA_CASH = 4.10;
    const TYPICAL_VAR_LOW  = RBA_CASH + 2.0;  // ~6.10%
    const TYPICAL_VAR_HIGH = RBA_CASH + 2.5;  // ~6.60%
    const rate = parseFloat(document.getElementById('interestRate').value) || 0;
    const tag  = document.getElementById('rateComparison');
    const hint = document.getElementById('rateHint');

    if (hint) hint.style.display = '';
    if (rate < TYPICAL_VAR_LOW) {
        tag.textContent = 'Below market';
        tag.className   = 'rate-tag below';
        if (hint) hint.textContent = 'Looks competitive — typical variable rates are ' + TYPICAL_VAR_LOW.toFixed(2) + '–' + TYPICAL_VAR_HIGH.toFixed(2) + '% (RBA cash rate ' + RBA_CASH + '%)';
    } else if (rate > TYPICAL_VAR_HIGH) {
        const over = (rate - TYPICAL_VAR_HIGH).toFixed(2);
        tag.textContent = over + '% above market';
        tag.className   = 'rate-tag above';
        if (hint) hint.textContent = 'Worth reviewing — you may be able to negotiate or refinance. Typical variable: ' + TYPICAL_VAR_LOW.toFixed(2) + '–' + TYPICAL_VAR_HIGH.toFixed(2) + '%';
    } else {
        tag.textContent = 'Market rate';
        tag.className   = 'rate-tag';
        if (hint) hint.textContent = 'In line with typical variable rates (' + TYPICAL_VAR_LOW.toFixed(2) + '–' + TYPICAL_VAR_HIGH.toFixed(2) + '%). RBA cash rate: ' + RBA_CASH + '%';
    }
}

// ─── Investor Tools ───────────────────────────────────────────

// Chart instances
let inv_plChartInstance = null;
let inv_depChartInstance = null;

// ATO effective life rulings — Div 40 plant & equipment items (years)
const DIV40_ITEMS = [
    { name: 'Hot water system',          life: 12, cost: 0.012 },
    { name: 'Air conditioning units',    life: 10, cost: 0.018 },
    { name: 'Carpets & floor coverings', life: 10, cost: 0.020 },
    { name: 'Blinds & curtains',         life: 6,  cost: 0.005 },
    { name: 'Dishwasher',                life: 10, cost: 0.004 },
    { name: 'Oven & cooktop',            life: 12, cost: 0.005 },
    { name: 'Smoke alarms',              life: 6,  cost: 0.002 },
    { name: 'Ceiling fans',              life: 10, cost: 0.003 },
    { name: 'Garden shed / outdoor',     life: 15, cost: 0.005 },
    { name: 'Security system',           life: 6,  cost: 0.006 },
];
// cost is fraction of purchase price used as initial value estimate

// 2024-25 Australian marginal rates (incl. Medicare 2%)
const TAX_BRACKETS = [
    { min: 0,      max: 18200,  rate: 0,     base: 0       },
    { min: 18201,  max: 45000,  rate: 0.19,  base: 0       },
    { min: 45001,  max: 120000, rate: 0.325, base: 5092    },
    { min: 120001, max: 180000, rate: 0.37,  base: 29467   },
    { min: 180001, max: Infinity, rate: 0.45, base: 51667  },
];

function initInvestorSliders() {
    // Deposit ↔ % slider ↔ loan amount sync
    const invPrice     = document.getElementById('inv_purchasePrice');
    const invDeposit   = document.getElementById('inv_deposit');
    const invDepSlider = document.getElementById('inv_depositSlider');
    const invLoan      = document.getElementById('inv_loanAmount');
    const invDepBadge  = document.getElementById('inv_depositPctBadge');
    const invLvrInd    = document.getElementById('inv_lvrIndicator');
    const invLmiNote   = document.getElementById('inv_lmiNotice');

    const syncInvDeposit = () => {
        const price   = parseFloat(invPrice?.value)   || 0;
        const deposit = parseFloat(invDeposit?.value) || 0;
        const loan    = Math.max(0, price - deposit);
        const pct     = price > 0 ? deposit / price * 100 : 0;
        const lvr     = price > 0 ? loan / price * 100     : 0;

        if (invLoan)      invLoan.value           = loan;
        if (invDepBadge)  invDepBadge.textContent = pct.toFixed(0) + '%';
        if (invDepSlider) { invDepSlider.value    = Math.round(pct); updateSliderFill(invDepSlider); }
        if (invLvrInd)    { invLvrInd.textContent = 'LVR ' + lvr.toFixed(0) + '%'; invLvrInd.classList.toggle('warn', lvr > 80); }
        if (invLmiNote)   invLmiNote.classList.toggle('hidden', lvr <= 80);
    };

    const syncInvSlider = () => {
        const price = parseFloat(invPrice?.value) || 0;
        const pct   = parseFloat(invDepSlider?.value) || 0;
        const dep   = Math.round(price * pct / 100 / 1000) * 1000;
        if (invDeposit) { invDeposit.value = dep; syncInvDeposit(); }
    };

    if (invPrice)     invPrice.addEventListener('input',     syncInvDeposit);
    if (invDeposit)   invDeposit.addEventListener('input',   syncInvDeposit);
    if (invDepSlider) invDepSlider.addEventListener('input', syncInvSlider);
    syncInvDeposit(); // initialise on load

    // Vacancy rate slider
    const vacSlider = document.getElementById('inv_vacancyRate');
    const vacBadge  = document.getElementById('inv_vacancyBadge');
    if (vacSlider) {
        vacSlider.addEventListener('input', () => {
            const weeks = (parseFloat(vacSlider.value) / 100 * 52).toFixed(1);
            vacBadge.textContent = weeks + ' wks/yr';
            updateSliderFill(vacSlider);
        });
        updateSliderFill(vacSlider);
    }

    // Property mgmt slider
    const mgmtSlider = document.getElementById('inv_propertyMgmt');
    const mgmtBadge  = document.getElementById('inv_mgmtBadge');
    if (mgmtSlider) {
        mgmtSlider.addEventListener('input', () => {
            mgmtBadge.textContent = parseFloat(mgmtSlider.value).toFixed(1) + '%';
            updateSliderFill(mgmtSlider);
        });
        updateSliderFill(mgmtSlider);
    }

    // Interest-only toggle
    const ioToggle    = document.getElementById('inv_interestOnlyToggle');
    const ioPeriodGroup = document.getElementById('inv_ioPeriodGroup');
    if (ioToggle) {
        ioToggle.addEventListener('change', () => {
            ioPeriodGroup.classList.toggle('hidden', !ioToggle.checked);
        });
    }

    // IO period slider
    const ioPeriodSlider = document.getElementById('inv_ioPeriod');
    const ioPeriodBadge  = document.getElementById('inv_ioPeriodBadge');
    if (ioPeriodSlider) {
        ioPeriodSlider.addEventListener('input', () => {
            ioPeriodBadge.textContent = ioPeriodSlider.value + ' yrs';
            updateSliderFill(ioPeriodSlider);
        });
        updateSliderFill(ioPeriodSlider);
    }

    // Global inflation slider
    const inflSlider = document.getElementById('inv_inflationRate');
    const inflBadge  = document.getElementById('inv_inflationBadge');
    if (inflSlider) {
        inflSlider.addEventListener('input', () => {
            inflBadge.textContent = parseFloat(inflSlider.value).toFixed(1) + '%';
            updateSliderFill(inflSlider);
        });
        updateSliderFill(inflSlider);
    }

    // Rent growth slider
    const rentGrowthSlider = document.getElementById('inv_rentGrowth');
    const rentGrowthBadge  = document.getElementById('inv_rentGrowthBadge');
    if (rentGrowthSlider) {
        rentGrowthSlider.addEventListener('input', () => {
            rentGrowthBadge.textContent = parseFloat(rentGrowthSlider.value).toFixed(1) + '%';
            updateSliderFill(rentGrowthSlider);
        });
        updateSliderFill(rentGrowthSlider);
    }

    // Property growth slider
    const propGrowthSlider = document.getElementById('inv_propertyGrowth');
    const propGrowthBadge  = document.getElementById('inv_propertyGrowthBadge');
    if (propGrowthSlider) {
        propGrowthSlider.addEventListener('input', () => {
            propGrowthBadge.textContent = parseFloat(propGrowthSlider.value).toFixed(1) + '%';
            updateSliderFill(propGrowthSlider);
        });
        updateSliderFill(propGrowthSlider);
    }
}

// Call initInvestorSliders from DOMContentLoaded — patched into main init above

function initPurchaseYearListeners() {
    const pyInput = document.getElementById('inv_purchaseYear');
    const ybInput = document.getElementById('inv_yearBuilt');
    const smInput = document.getElementById('inv_settlementMonth');
    if (!pyInput) return;
    const update = () => updatePurchaseYearContext();
    pyInput.addEventListener('input', update);
    ybInput.addEventListener('input', update);
    smInput.addEventListener('change', update);
    updatePurchaseYearContext();
}

function updatePurchaseYearContext() {
    const pyInput = document.getElementById('inv_purchaseYear');
    const ybInput = document.getElementById('inv_yearBuilt');
    const badge   = document.getElementById('inv_purchaseYearBadge');
    const ctx     = document.getElementById('inv_purchaseContext');
    if (!pyInput || !ctx) return;

    const purchaseYear = parseInt(pyInput.value) || 2025;
    const yearBuilt    = parseInt(ybInput.value)  || 2010;
    const currentYear  = new Date().getFullYear();
    const elapsedDiv43 = Math.max(0, purchaseYear - yearBuilt);
    const remainingDiv43 = Math.max(0, 40 - elapsedDiv43);
    const isEligible = yearBuilt >= 1987;

    badge.textContent = purchaseYear === currentYear ? 'Current year'
                      : purchaseYear > currentYear  ? purchaseYear - currentYear + ' yrs ahead'
                      : currentYear - purchaseYear  + ' yrs ago';

    let lines = [];
    if (!isEligible) {
        lines.push({ icon: '⚠️', text: 'Year built ' + yearBuilt + ' — pre-1987, Div 43 not available', warn: true });
    } else if (elapsedDiv43 >= 40) {
        lines.push({ icon: '⚠️', text: 'Div 43 fully exhausted — ' + elapsedDiv43 + ' years elapsed since construction', warn: true });
    } else {
        lines.push({ icon: '✓', text: 'Div 43 available: ' + remainingDiv43 + ' years remaining (of 40)', warn: false });
    }
    lines.push({ icon: '📅', text: 'Div 40 balances adjusted for ' + elapsedDiv43 + ' year' + (elapsedDiv43 !== 1 ? 's' : '') + ' of age at purchase', warn: false });

    ctx.innerHTML = lines.map(l =>
        `<div class="inv-ctx-line ${l.warn ? 'inv-ctx-warn' : 'inv-ctx-ok'}">${l.icon} ${l.text}</div>`
    ).join('');
}

function calculateInvestor() {
    // ── Inputs ─────────────────────────────────────────────────
    const purchasePrice    = parseFloat(document.getElementById('inv_purchasePrice').value)    || 0;
    const purchaseYear     = parseInt(document.getElementById('inv_purchaseYear').value)        || 2025;
    const settlementMonth  = parseInt(document.getElementById('inv_settlementMonth').value)     || 7;
    const constructionCost = parseFloat(document.getElementById('inv_constructionCost').value) || 0;
    const yearBuilt        = parseInt(document.getElementById('inv_yearBuilt').value)           || 1990;
    const propertyType     = document.getElementById('inv_propertyType').value;
    const loanAmount       = parseFloat(document.getElementById('inv_loanAmount').value)       || 0;
    const interestRate     = parseFloat(document.getElementById('inv_interestRate').value)     || 0;
    const loanTerm         = parseInt(document.getElementById('inv_loanTerm').value)           || 30;
    const weeklyRent       = parseFloat(document.getElementById('inv_weeklyRent').value)       || 0;
    const vacancyPct       = parseFloat(document.getElementById('inv_vacancyRate').value)      || 0;
    const councilRates     = parseFloat(document.getElementById('inv_councilRates').value)     || 0;
    const insurance        = parseFloat(document.getElementById('inv_insurance').value)        || 0;
    const mgmtPct          = parseFloat(document.getElementById('inv_propertyMgmt').value)     || 0;
    const repairs          = parseFloat(document.getElementById('inv_repairs').value)          || 0;
    const strataFees       = parseFloat(document.getElementById('inv_strataFees').value)       || 0;
    const otherExpenses    = parseFloat(document.getElementById('inv_otherExpenses').value)    || 0;
    const marginalRatePct  = parseFloat(document.getElementById('inv_marginalRate').value)     || 37;
    const marginalRate     = marginalRatePct / 100;

    // ── Interest-only toggle ───────────────────────────────────
    const isIO       = document.getElementById('inv_interestOnlyToggle')?.checked || false;
    const ioPeriod   = isIO ? (parseInt(document.getElementById('inv_ioPeriod')?.value) || 5) : 0;
    // For backwards compatibility, expose loanTypeVal as before
    const loanTypeVal = isIO ? 'io' : 'pi';

    // ── Inflation rates ────────────────────────────────────────
    // Base rate (fallback for any expense with no override)
    const baseInflation   = parseFloat(document.getElementById('inv_inflationRate')?.value) / 100 || 0.03;
    const rentGrowthRate  = parseFloat(document.getElementById('inv_rentGrowth')?.value)    / 100 || 0.035;
    const propertyGrowthRate = parseFloat(document.getElementById('inv_propertyGrowth')?.value) / 100 || 0.06;

    // Per-expense inflation rates — fall back to base if field is empty
    function getInfl(id) {
        const el = document.getElementById(id);
        const v  = el ? el.value.trim() : '';
        return v === '' ? baseInflation : (parseFloat(v) / 100 || 0);
    }
    const inflCouncil   = getInfl('inv_councilRatesInfl');
    const inflInsurance = getInfl('inv_insuranceInfl');
    const inflRepairs   = getInfl('inv_repairsInfl');
    const inflStrata    = getInfl('inv_strataInfl');
    const inflOther     = getInfl('inv_otherInfl');

    // ── Purchase year / partial year ───────────────────────────
    const monthsInFirstYear = 13 - settlementMonth;
    const firstYearFraction = monthsInFirstYear / 12;

    // ── Div 43 remaining life ──────────────────────────────────
    const yearsElapsedAtPurchase = Math.max(0, purchaseYear - yearBuilt);
    const div43YearsUsed      = Math.min(40, yearsElapsedAtPurchase);
    const div43YearsRemaining = Math.max(0, 40 - div43YearsUsed);
    const isEligibleDiv43     = yearBuilt >= 1987 && constructionCost > 0 && div43YearsRemaining > 0;
    const annualDiv43Full     = isEligibleDiv43 ? constructionCost * 0.025 : 0;
    const div43FirstYear      = isEligibleDiv43 ? annualDiv43Full * firstYearFraction : 0;

    // ── Div 40: age-adjusted opening balances ─────────────────
    const div40Items = DIV40_ITEMS.map(item => {
        const dvRate = 2 / item.life;
        let bal = purchasePrice * item.cost;
        for (let y = 0; y < yearsElapsedAtPurchase; y++) {
            bal = Math.max(0, bal - bal * dvRate);
        }
        return { ...item, openingValue: bal, dvRate };
    });

    // ── Loan repayment calculation ─────────────────────────────
    const monthlyRate = (interestRate / 100) / 12;
    const totalMonths = loanTerm * 12;
    const annualInterest = loanAmount * (interestRate / 100); // simple annual interest

    // IO period: interest-only for ioPeriod years, then P&I for remainder
    // For year-1 / display purposes we use full-year figures
    let weeklyRepayment, annualLoanRepayment;
    let weeklyIORepayment, weeklyPIRepayment;

    weeklyIORepayment = annualInterest / 52;
    if (!isIO || ioPeriod >= loanTerm) {
        // Pure interest-only for full term
        annualLoanRepayment = annualInterest;
        weeklyRepayment     = weeklyIORepayment;
    } else {
        // P&I repayment for the remaining (loanTerm - ioPeriod) years
        const piMonths = (loanTerm - ioPeriod) * 12;
        const monthlyPI = monthlyRate > 0
            ? loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, piMonths)) / (Math.pow(1 + monthlyRate, piMonths) - 1)
            : loanAmount / piMonths;
        weeklyPIRepayment   = monthlyPI * 12 / 52;
        // Year 1 is IO
        annualLoanRepayment = annualInterest;
        weeklyRepayment     = weeklyIORepayment;
    }

    // ── Base-year rental income ────────────────────────────────
    const effectiveWeeks  = 52 * (1 - vacancyPct / 100);
    const annualGrossRent = weeklyRent * effectiveWeeks;
    const weeklyGrossRent = weeklyRent * (1 - vacancyPct / 100);

    // ── Base-year cash expenses ────────────────────────────────
    const mgmtFee           = annualGrossRent * (mgmtPct / 100);
    const annualCashExpenses = councilRates + insurance + mgmtFee + repairs + strataFees + otherExpenses;
    const weeklyCashExpenses = annualCashExpenses / 52;

    // ── Yield (base year, full year basis) ────────────────────
    const grossYield = purchasePrice > 0 ? (weeklyRent * 52 / purchasePrice) * 100 : 0;
    const netYield   = purchasePrice > 0 ? ((annualGrossRent - annualCashExpenses) / purchasePrice) * 100 : 0;

    // ── Weekly cash flow (base year) ──────────────────────────
    const weeklyInterest     = annualInterest / 52;
    const weeklyNetCashFlow  = weeklyGrossRent - weeklyCashExpenses - weeklyRepayment;
    const weeklyInterestOnly = weeklyGrossRent - weeklyCashExpenses - weeklyInterest;

    // ── Tax benefit (base year, full year) ────────────────────
    const annualTaxableExpenses  = annualCashExpenses + annualInterest;
    const annualNetTaxableIncome = annualGrossRent - annualTaxableExpenses;
    const annualTaxLoss          = Math.min(0, annualNetTaxableIncome);
    const annualTaxBenefit       = Math.abs(annualTaxLoss) * marginalRate;
    const weeklyTaxBenefit       = annualTaxBenefit / 52;
    const weeklyAfterTax         = weeklyInterestOnly + weeklyTaxBenefit;

    let gearingStatus;
    if (annualNetTaxableIncome < -500)     gearingStatus = 'negative';
    else if (annualNetTaxableIncome > 500) gearingStatus = 'positive';
    else                                    gearingStatus = 'neutral';

    // ── Build year-by-year schedule with inflation + IO/PI ─────
    const holdingYears = Math.min(40, loanTerm + 5);
    const depSchedule  = [];
    let div40Balances  = div40Items.map(i => i.openingValue);
    let cumDep = 0;
    let div43WrittenDown = 0;

    for (let idx = 0; idx < holdingYears; idx++) {
        const calYear  = purchaseYear + idx;
        const fraction = idx === 0 ? firstYearFraction : 1;
        const yearsGrown = idx; // for inflation compounding; year 0 = base values

        // ── Inflation-adjusted expenses for this year ──────────
        // Compound from base year. For year 0 (partial), use base values prorated.
        const inflFactor = (rate) => Math.pow(1 + rate, yearsGrown);

        const councilYear  = councilRates * inflFactor(inflCouncil);
        const insuranceYear = insurance   * inflFactor(inflInsurance);
        const repairsYear  = repairs      * inflFactor(inflRepairs);
        const strataYear   = strataFees   * inflFactor(inflStrata);
        const otherYear    = otherExpenses * inflFactor(inflOther);

        // ── Inflation-adjusted rent ────────────────────────────
        const rentYear     = weeklyRent * inflFactor(rentGrowthRate);
        const grossRentYear = rentYear * effectiveWeeks;
        const mgmtFeeYear  = grossRentYear * (mgmtPct / 100);

        const totalExpensesYear = councilYear + insuranceYear + mgmtFeeYear + repairsYear + strataYear + otherYear;

        // ── Repayment for this year (IO vs P&I switchover) ─────
        const yearNum = idx + 1; // 1-based holding year
        let repaymentYear, interestYear;
        if (!isIO) {
            // Full P&I from day one
            const monthlyPI = monthlyRate > 0
                ? loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / (Math.pow(1 + monthlyRate, totalMonths) - 1)
                : loanAmount / totalMonths;
            repaymentYear = monthlyPI * 12 * fraction;
            interestYear  = annualInterest * fraction; // approximate for P&L display
        } else if (yearNum <= ioPeriod) {
            // Interest-only period
            repaymentYear = annualInterest * fraction;
            interestYear  = annualInterest * fraction;
        } else {
            // Switched to P&I
            const piMonths = (loanTerm - ioPeriod) * 12;
            const monthlyPI = monthlyRate > 0 && piMonths > 0
                ? loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, piMonths)) / (Math.pow(1 + monthlyRate, piMonths) - 1)
                : loanAmount / Math.max(piMonths, 1);
            repaymentYear = monthlyPI * 12 * fraction;
            interestYear  = annualInterest * fraction; // interest decreasing but approx for display
        }

        // ── Depreciation ───────────────────────────────────────
        const div43ForYear = isEligibleDiv43 && (div43YearsUsed + idx) < 40
            ? annualDiv43Full * fraction : 0;

        let div40Total = 0;
        div40Balances = div40Balances.map((bal, i) => {
            if (bal < 1) return 0;
            const actual = Math.min(bal * div40Items[i].dvRate * fraction, bal);
            div40Total += actual;
            return Math.max(0, bal - actual);
        });

        const totalDep  = div43ForYear + div40Total;
        const taxSaving = totalDep * marginalRate;
        div43WrittenDown += div43ForYear;
        cumDep += totalDep;

        // ── Net taxable income for this year ───────────────────
        const rent     = grossRentYear * fraction;
        const expenses = totalExpensesYear * fraction;
        const netTax   = rent - expenses - interestYear - totalDep;

        depSchedule.push({
            year: yearNum,
            calYear, fraction,
            div43: div43ForYear, div40: div40Total, total: totalDep,
            taxSaving, cumulative: cumDep,
            div43Remaining: Math.max(0, constructionCost * 0.025 * (40 - div43YearsUsed - idx - 1)),
            rent, expenses, interest: interestYear, repayment: repaymentYear, netTax,
            // For inflation detail display
            councilYear, insuranceYear, mgmtFeeYear, repairsYear, strataYear, otherYear,
            rentWeekly: rentYear, isIOYear: isIO && yearNum <= ioPeriod
        });
    }

    const yr1Dep         = depSchedule[0]?.total || 0;
    const totalDiv43     = depSchedule.reduce((s, r) => s + r.div43, 0);
    const totalDiv40     = depSchedule.reduce((s, r) => s + r.div40, 0);
    const totalDep       = totalDiv43 + totalDiv40;
    const totalTaxFromDep = totalDep * marginalRate;

    const result = {
        purchasePrice, purchaseYear, settlementMonth, firstYearFraction, monthsInFirstYear,
        constructionCost, yearBuilt, yearsElapsedAtPurchase, div43YearsUsed, div43YearsRemaining,
        propertyType, loanAmount, interestRate, loanTypeVal, loanTerm,
        isIO, ioPeriod, weeklyIORepayment, weeklyPIRepayment,
        weeklyRent, effectiveWeeks, annualGrossRent, weeklyGrossRent,
        mgmtFee, annualCashExpenses, weeklyCashExpenses,
        weeklyRepayment, weeklyInterest, weeklyInterestOnly,
        weeklyNetCashFlow, weeklyAfterTax, weeklyTaxBenefit,
        grossYield, netYield,
        annualInterest, annualNetTaxableIncome, annualTaxLoss, annualTaxBenefit,
        marginalRatePct, marginalRate, gearingStatus,
        isEligibleDiv43, annualDiv43Full, div43FirstYear, div40Items, depSchedule,
        totalDiv43, totalDiv40, totalDep, totalTaxFromDep, yr1Dep,
        councilRates, insurance, repairs, strataFees, otherExpenses, annualLoanRepayment,
        holdingYears,
        baseInflation, rentGrowthRate, propertyGrowthRate, inflCouncil, inflInsurance, inflRepairs, inflStrata, inflOther
    };

    window._lastInvResult = result;
    displayInvestorResults(result);
}

function displayInvestorResults(r) {
    document.getElementById('inv_emptyState').style.display = 'none';
    document.getElementById('inv_results').classList.remove('hidden');

    // ── KPI strip ─────────────────────────────────────────────
    const partialNote = r.firstYearFraction < 1
        ? r.monthsInFirstYear + ' months in ' + r.purchaseYear
        : 'full year';
    const loanStructureLabel = r.isIO
        ? 'IO ' + r.ioPeriod + 'yr → P&amp;I ' + (r.loanTerm - r.ioPeriod) + 'yr'
        : 'P&amp;I ' + r.loanTerm + 'yr';
    const kpis = [
        { label: 'Gross Yield',        value: r.grossYield.toFixed(2) + '%',  sub: 'of purchase price',                  primary: false },
        { label: 'Net Yield',          value: r.netYield.toFixed(2) + '%',    sub: 'after cash expenses',                primary: true  },
        { label: 'Weekly Income',      value: fmt(r.weeklyGrossRent),          sub: 'effective rent received',            primary: false },
        { label: 'Weekly Cash Flow',   value: fmt(r.weeklyNetCashFlow),        sub: r.weeklyNetCashFlow >= 0 ? 'cash surplus' : 'cash outlay', primary: false },
        { label: 'Loan Structure',     value: loanStructureLabel,              sub: r.interestRate + '% p.a.',            primary: false },
        { label: 'Annual Tax Benefit', value: fmt(r.annualTaxBenefit),         sub: 'neg. gearing @ ' + r.marginalRatePct + '%', primary: false },
        { label: 'Yr 1 Depreciation',  value: fmt(r.yr1Dep),                  sub: partialNote + ' — Div 43 + 40',       primary: false },
        { label: 'Div 43 Remaining',   value: r.isEligibleDiv43 ? r.div43YearsRemaining + ' yrs' : 'N/A',
                                        sub: r.isEligibleDiv43 ? 'from ' + r.purchaseYear + ' (built ' + r.yearBuilt + ')' : 'pre-1987 or no build cost', primary: false },
    ];
    document.getElementById('inv_kpiStrip').innerHTML = kpis.map(k => `
        <div class="metric-tile ${k.primary ? 'metric-primary' : ''}">
            <div class="metric-label">${k.label}</div>
            <div class="metric-value" style="${k.label === 'Weekly Cash Flow' ? (r.weeklyNetCashFlow < 0 ? 'color:var(--red)' : 'color:var(--emerald-dark)') : ''}">${k.value}</div>
            <div class="metric-sub">${k.sub}</div>
        </div>
    `).join('');

    // ── Gearing badge ─────────────────────────────────────────
    const gb = document.getElementById('inv_gearingBadge');
    gb.className = 'inv-gearing-badge ' + r.gearingStatus;
    gb.textContent = r.gearingStatus === 'negative' ? 'Negatively Geared'
                   : r.gearingStatus === 'positive' ? 'Positively Geared' : 'Neutrally Geared';

    document.getElementById('inv_taxRateBadge').textContent = r.marginalRatePct + '% marginal rate';

    // Store result for frequency toggle re-render
    window._lastInvResult = r;

    // ── Cash flow rows (annual by default) ────────────────────
    renderCashFlowRows(r, 'annual');

    // ── Tax benefit rows (annual) ──────────────────────────────
    const firstYrDep = r.depSchedule[0]?.total || 0;
    const taxRows = [
        { label: 'Gross Rental Income',         val: r.annualGrossRent,  cls: 'income'    },
        { label: 'Less: Loan Interest',          val: -r.annualInterest,  cls: 'deduction' },
        { label: 'Less: Council Rates',          val: -r.councilRates,    cls: 'deduction' },
        { label: 'Less: Insurance',              val: -r.insurance,       cls: 'deduction' },
        { label: 'Less: Property Management',    val: -r.mgmtFee,         cls: 'deduction' },
        { label: 'Less: Repairs & Maintenance',  val: -r.repairs,         cls: 'deduction' },
    ];
    if (r.strataFees > 0)    taxRows.push({ label: 'Less: Strata',  val: -r.strataFees,    cls: 'deduction' });
    if (r.otherExpenses > 0) taxRows.push({ label: 'Less: Other',   val: -r.otherExpenses, cls: 'deduction' });
    taxRows.push({ label: 'Less: Depreciation (Yr 1, ' + r.monthsInFirstYear + ' mo)', val: -firstYrDep, cls: 'deduction' });

    document.getElementById('inv_taxRows').innerHTML = taxRows.map(row =>
        `<div class="inv-row ${row.cls}">
            <span>${row.label}</span>
            <strong>${fmtSigned(row.val)}</strong>
        </div>`
    ).join('');

    const taxLossWithDep    = r.annualNetTaxableIncome - firstYrDep;
    const taxBenefitWithDep = Math.abs(Math.min(0, taxLossWithDep)) * r.marginalRate;
    document.getElementById('inv_taxTotal').innerHTML = `
        <span class="total-label">Net Taxable Income (${r.purchaseYear})</span>
        <span class="${taxLossWithDep < 0 ? 'total-negative' : 'total-positive'}">${fmt(taxLossWithDep)}</span>
    `;
    document.getElementById('inv_afterTax').innerHTML = `
        <span>Annual Tax Benefit incl. depreciation</span>
        <strong>${fmt(taxBenefitWithDep)}</strong>
    `;

    // ── Depreciation summary stats ─────────────────────────────
    const div43EndYear = r.purchaseYear + r.div43YearsRemaining - 1;
    document.getElementById('inv_depSummary').innerHTML = `
        <div class="inv-dep-stat">
            <span class="inv-dep-stat-label">Div 43 Annual (full yr)</span>
            <span class="inv-dep-stat-value blue">${r.isEligibleDiv43 ? fmt(r.annualDiv43Full) : 'Not eligible'}</span>
        </div>
        <div class="inv-dep-stat">
            <span class="inv-dep-stat-label">Div 43 Year 1 (${r.monthsInFirstYear} mo)</span>
            <span class="inv-dep-stat-value blue">${r.isEligibleDiv43 ? fmt(r.div43FirstYear) : '—'}</span>
        </div>
        <div class="inv-dep-stat">
            <span class="inv-dep-stat-label">Div 43 Remaining</span>
            <span class="inv-dep-stat-value blue">${r.isEligibleDiv43 ? r.div43YearsRemaining + ' yrs (to ' + div43EndYear + ')' : 'N/A'}</span>
        </div>
        <div class="inv-dep-stat">
            <span class="inv-dep-stat-label">Div 40 Year 1</span>
            <span class="inv-dep-stat-value amber">${fmt(r.depSchedule[0]?.div40 || 0)}</span>
        </div>
        <div class="inv-dep-stat">
            <span class="inv-dep-stat-label">Div 40 Opening Bal.</span>
            <span class="inv-dep-stat-value amber">${fmt(r.div40Items.reduce((s, i) => s + i.openingValue, 0))}<span class="inv-dep-stat-age"> (age-adj.)</span></span>
        </div>
        <div class="inv-dep-stat">
            <span class="inv-dep-stat-label">Total Yr 1 Dep.</span>
            <span class="inv-dep-stat-value">${fmt(r.yr1Dep)}</span>
        </div>
        <div class="inv-dep-stat">
            <span class="inv-dep-stat-label">Total Div 43 (investor)</span>
            <span class="inv-dep-stat-value blue">${fmt(r.totalDiv43)}</span>
        </div>
        <div class="inv-dep-stat">
            <span class="inv-dep-stat-label">Total Tax from Dep.</span>
            <span class="inv-dep-stat-value" style="color:var(--emerald-dark)">${fmt(r.totalTaxFromDep)}</span>
        </div>
    `;

    // ── Depreciation table ─────────────────────────────────────
    document.getElementById('inv_depBody').innerHTML = r.depSchedule.map(row => {
        const partialFlag = row.fraction < 1 ? ' <span class="dep-partial-flag">' + Math.round(row.fraction * 12) + ' mo</span>' : '';
        const taxYearLabel = 'FY' + String(row.calYear).slice(-2) + '/' + String(row.calYear + 1).slice(-2);
        return `<tr>
            <td>${taxYearLabel}${partialFlag}</td>
            <td class="div43-val">${row.div43 > 0.01 ? fmt(row.div43) : '—'}</td>
            <td class="div40-val">${row.div40 > 0.01 ? fmt(row.div40) : '—'}</td>
            <td>${fmt(row.total)}</td>
            <td class="tax-saving">${fmt(row.taxSaving)}</td>
            <td class="div43-val">${row.div43 > 0.01 ? fmt(row.div43Remaining) : '—'}</td>
            <td>${fmt(row.cumulative)}</td>
        </tr>`;
    }).join('');

    // Update disclaimer
    const disc = document.getElementById('inv_depDisclaimer');
    if (disc && r.yearsElapsedAtPurchase > 0) {
        disc.textContent = 'Depreciation schedule starts from the purchase year (' + r.purchaseYear
            + '). The building was constructed in ' + r.yearBuilt + ' — ' + r.yearsElapsedAtPurchase
            + ' year' + (r.yearsElapsedAtPurchase !== 1 ? 's' : '') + ' of Div 43 have already been used, leaving '
            + r.div43YearsRemaining + ' years remaining for this investor. Div 40 opening balances are age-adjusted '
            + 'using the diminishing value method from ' + r.yearBuilt + '. First year prorated to '
            + r.monthsInFirstYear + ' months (settlement ' + monthName(r.settlementMonth) + ' ' + r.purchaseYear
            + '). A Quantity Surveyor\'s report is required for ATO lodgement. Estimates only — not financial advice.';
    }

    // ── Charts ─────────────────────────────────────────────────
    renderInvPLChart(r);
    renderDepreciationChart(r, document.querySelector('.inv-dep-tab.active')?.dataset.dep || 'both');
    renderEquityChart(r);
}

function monthName(n) {
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][n - 1] || '';
}

// ── Cash flow rows renderer (supports annual / weekly toggle) ─
let inv_equityChartInstance = null;

function renderCashFlowRows(r, freq) {
    const isAnnual = freq !== 'weekly';
    const div = isAnnual ? 1 : 52;
    const unit = isAnnual ? '/yr' : '/wk';

    const annualRepayment = r.annualLoanRepayment;
    const annualInterest  = r.annualInterest;
    const mgmtAnnual      = r.mgmtFee;
    const councilAnnual   = r.councilRates;
    const insuranceAnnual = r.insurance;
    const repairsAnnual   = r.repairs;
    const strataAnnual    = r.strataFees;
    const otherAnnual     = r.otherExpenses;

    const annualNetCashFlow = r.annualGrossRent - r.annualCashExpenses - annualRepayment;

    // Inflation tags
    const pctLabel = (rate) => rate > 0
        ? ' <span class="inv-infl-tag">+' + (rate * 100).toFixed(1) + '% p.a.</span>' : '';
    const rentGrowthLabel = r.rentGrowthRate > 0
        ? ' <span class="inv-infl-tag inv-infl-tag--green">+' + (r.rentGrowthRate * 100).toFixed(1) + '% p.a.</span>' : '';

    const loanRepayLabel = r.isIO
        ? 'Loan Repayment <span class="inv-loan-type-tag inv-loan-type-tag--io">IO ' + r.ioPeriod + 'yr</span>'
        : 'Loan Repayment <span class="inv-loan-type-tag inv-loan-type-tag--pi">P&amp;I</span>';
    const interestCompLabel = r.isIO ? '↳ Interest Only (full)' : '↳ Interest Component';

    const cfRows = [
        { label: 'Gross Rent (effective)' + rentGrowthLabel, val:  r.annualGrossRent / div,  cls: 'income',  html: true },
        { label: loanRepayLabel,                              val: -annualRepayment  / div,   cls: 'expense', html: true },
        { label: interestCompLabel,                           val: -annualInterest   / div,   cls: 'indent',  html: true },
        { label: 'Council Rates'       + pctLabel(r.inflCouncil),   val: -councilAnnual   / div, cls: 'expense', html: true },
        { label: 'Landlord Insurance'  + pctLabel(r.inflInsurance), val: -insuranceAnnual / div, cls: 'expense', html: true },
        { label: 'Property Management',                       val: -mgmtAnnual      / div,   cls: 'expense', html: false },
        { label: 'Repairs &amp; Maintenance' + pctLabel(r.inflRepairs), val: -repairsAnnual / div, cls: 'expense', html: true },
    ];
    if (r.strataFees > 0)    cfRows.push({ label: 'Strata / Body Corporate' + pctLabel(r.inflStrata), val: -strataAnnual / div, cls: 'expense', html: true });
    if (r.otherExpenses > 0) cfRows.push({ label: 'Other' + pctLabel(r.inflOther), val: -otherAnnual / div, cls: 'expense', html: true });

    let switchNote = '';
    if (r.isIO && r.weeklyPIRepayment) {
        const piDisplay = isAnnual ? fmt(r.weeklyPIRepayment * 52) + '/yr' : fmt(r.weeklyPIRepayment) + '/wk';
        switchNote = `<div class="inv-io-switch-note">
            After IO period (${r.purchaseYear + r.ioPeriod}): repayment switches to P&amp;I — ${piDisplay}
        </div>`;
    }

    document.getElementById('inv_cashFlowRows').innerHTML = cfRows.map(row =>
        `<div class="inv-row ${row.cls}">
            <span>${row.html ? row.label : row.label.replace(/&amp;/g, '&')}</span>
            <strong>${fmtSigned(row.val)}${unit}</strong>
        </div>`
    ).join('') + switchNote;

    const cfNet = annualNetCashFlow / div;
    document.getElementById('inv_cashFlowTotal').innerHTML = `
        <span class="total-label">Net ${isAnnual ? 'Annual' : 'Weekly'} Cash Flow</span>
        <span class="${cfNet >= 0 ? 'total-positive' : 'total-negative'}">${fmtSigned(cfNet)}${unit}</span>
    `;
}

function switchCFFreq(freq, btn) {
    document.querySelectorAll('.inv-freq-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (window._lastInvResult) renderCashFlowRows(window._lastInvResult, freq);
}

// ── Property Value & Equity Chart ────────────────────────────
function renderEquityChart(r) {
    const isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#8CA4BB' : '#8896A9';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    const showYears = Math.min(r.holdingYears, 30);
    const labels = [];
    const propValues  = [];
    const loanBals    = [];
    const equityVals  = [];

    // Build loan balance schedule year-by-year (P&I amortisation / IO holdout)
    const monthlyRate = (r.interestRate / 100) / 12;
    const totalMonths = r.loanTerm * 12;

    // Pre-compute monthly P&I payment for the full loan (used outside IO period)
    const monthlyPIPayment = monthlyRate > 0
        ? r.loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / (Math.pow(1 + monthlyRate, totalMonths) - 1)
        : r.loanAmount / totalMonths;

    // P&I payment for post-IO period
    const piMonths = r.isIO && r.ioPeriod < r.loanTerm ? (r.loanTerm - r.ioPeriod) * 12 : totalMonths;
    const monthlyPIAfterIO = (monthlyRate > 0 && piMonths > 0)
        ? r.loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, piMonths)) / (Math.pow(1 + monthlyRate, piMonths) - 1)
        : r.loanAmount / piMonths;

    let loanBal = r.loanAmount;

    for (let yr = 0; yr <= showYears; yr++) {
        const calYear  = r.purchaseYear + yr;
        const propVal  = r.purchasePrice * Math.pow(1 + r.propertyGrowthRate, yr);
        const equity   = propVal - loanBal;
        const equityPct = propVal > 0 ? ((equity / propVal) * 100).toFixed(1) : '0.0';

        labels.push(yr === 0 ? r.purchaseYear.toString() : String(calYear));
        propValues.push(Math.round(propVal));
        loanBals.push(Math.max(0, Math.round(loanBal)));
        equityVals.push(Math.round(equity));

        // Advance loan balance by 12 months
        if (yr < showYears) {
            const yearNum = yr + 1;
            for (let m = 0; m < 12; m++) {
                if (loanBal <= 0) break;
                const interestM = loanBal * monthlyRate;
                let principalM;
                if (r.isIO && yearNum <= r.ioPeriod) {
                    principalM = 0; // interest only, balance unchanged
                } else {
                    const payment = r.isIO ? monthlyPIAfterIO : monthlyPIPayment;
                    principalM = Math.min(payment - interestM, loanBal);
                }
                loanBal = Math.max(0, loanBal - principalM);
            }
        }
    }

    // Equity KPI pills
    const finalPropVal  = propValues[propValues.length - 1];
    const finalLoanBal  = loanBals[loanBals.length - 1];
    const finalEquity   = equityVals[equityVals.length - 1];
    const totalGrowth   = ((finalPropVal - r.purchasePrice) / r.purchasePrice * 100).toFixed(0);
    const equityMultiple = r.purchasePrice > 0 ? (finalEquity / (r.purchasePrice - r.loanAmount)).toFixed(1) : '—';

    const kpiEl = document.getElementById('inv_equityKpis');
    if (kpiEl) {
        kpiEl.innerHTML = `
            <span class="inv-equity-pill inv-equity-pill--green">Proj. value ${fmt(finalPropVal)} (+${totalGrowth}%)</span>
            <span class="inv-equity-pill inv-equity-pill--blue">Equity ${fmt(finalEquity)}</span>
            <span class="inv-equity-pill">${equityMultiple}× equity return</span>
        `;
    }

    const ctx = document.getElementById('inv_equityChart');
    if (inv_equityChartInstance) inv_equityChartInstance.destroy();
    inv_equityChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Property Value',
                    data: propValues,
                    borderColor: '#0A2540',
                    backgroundColor: isDark ? 'rgba(10,37,64,0.15)' : 'rgba(10,37,64,0.04)',
                    fill: true, tension: 0.3, pointRadius: 2.5,
                    borderWidth: 2.5, pointBackgroundColor: '#0A2540',
                },
                {
                    label: 'Equity',
                    data: equityVals,
                    borderColor: '#00C896',
                    backgroundColor: isDark ? 'rgba(0,200,150,0.2)' : 'rgba(0,200,150,0.1)',
                    fill: true, tension: 0.3, pointRadius: 2.5,
                    borderWidth: 2.5, pointBackgroundColor: '#00C896',
                },
                {
                    label: 'Loan Balance',
                    data: loanBals,
                    borderColor: '#E24B4A',
                    backgroundColor: 'transparent',
                    fill: false, tension: 0.3, pointRadius: 2,
                    borderWidth: 2, borderDash: [5, 3],
                    pointBackgroundColor: '#E24B4A',
                },
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true, position: 'top',
                    labels: {
                        color: textColor, font: { family: 'DM Sans', size: 12 },
                        boxWidth: 12, padding: 16, usePointStyle: true, pointStyle: 'circle'
                    }
                },
                tooltip: {
                    mode: 'index', intersect: false,
                    callbacks: {
                        label: c => '  ' + c.dataset.label + ': ' + fmt(c.raw),
                        afterBody: (items) => {
                            const pv = items.find(i => i.dataset.label === 'Property Value')?.raw || 0;
                            const eq = items.find(i => i.dataset.label === 'Equity')?.raw || 0;
                            if (pv > 0) return ['  Equity ratio: ' + (eq / pv * 100).toFixed(1) + '%'];
                            return [];
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: textColor, maxTicksLimit: 12, font: { family: 'DM Sans', size: 11 } },
                    grid: { color: gridColor }
                },
                y: {
                    ticks: {
                        color: textColor,
                        callback: v => '$' + (v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v),
                        font: { family: 'DM Sans', size: 11 }
                    },
                    grid: { color: gridColor }
                }
            },
            animation: { duration: 600, easing: 'easeInOutQuart' }
        }
    });
}

function renderInvPLChart(r) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#8CA4BB' : '#8896A9';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    // Use depSchedule data (already year-by-year with partial first year baked in)
    // Show up to 10 years
    const showYears = Math.min(10, r.depSchedule.length);
    const labels     = r.depSchedule.slice(0, showYears).map(d =>
        'FY' + String(d.calYear).slice(-2) + '/' + String(d.calYear + 1).slice(-2)
    );
    const income      = r.depSchedule.slice(0, showYears).map(d => Math.round(d.rent));
    const expenses    = r.depSchedule.slice(0, showYears).map(d => -Math.round(d.expenses));
    const interest    = r.depSchedule.slice(0, showYears).map(d => -Math.round(d.interest));
    const depreciation = r.depSchedule.slice(0, showYears).map(d => -Math.round(d.total));
    const netTaxable  = r.depSchedule.slice(0, showYears).map(d => Math.round(d.netTax));

    const ctx = document.getElementById('inv_plChart');
    if (inv_plChartInstance) inv_plChartInstance.destroy();
    inv_plChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Rental Income',    data: income,       backgroundColor: 'rgba(0,200,150,0.75)',  stack: 'a' },
                { label: 'Cash Expenses',    data: expenses,     backgroundColor: 'rgba(226,75,74,0.65)',  stack: 'a' },
                { label: 'Interest',         data: interest,     backgroundColor: 'rgba(37,99,235,0.65)',  stack: 'a' },
                { label: 'Depreciation',     data: depreciation, backgroundColor: 'rgba(180,83,9,0.6)',   stack: 'a' },
                {
                    label: 'Net Taxable P&L',
                    data: netTaxable,
                    type: 'line',
                    borderColor: isDark ? '#00C896' : '#0A2540',
                    backgroundColor: 'transparent',
                    pointBackgroundColor: isDark ? '#00C896' : '#0A2540',
                    pointRadius: 4, tension: 0.3, order: 0,
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true, position: 'top', labels: { color: textColor, font: { family: 'DM Sans', size: 11 }, boxWidth: 10, padding: 12 } },
                tooltip: { mode: 'index', intersect: false, callbacks: { label: c => ' ' + c.dataset.label + ': ' + fmt(c.raw) } }
            },
            scales: {
                x: { stacked: true, ticks: { color: textColor, font: { family: 'DM Sans', size: 11 } }, grid: { color: gridColor } },
                y: { stacked: true, ticks: { color: textColor, callback: v => '$' + (Math.abs(v) >= 1000 ? (v/1000).toFixed(0)+'k' : v), font: { family: 'DM Sans', size: 11 } }, grid: { color: gridColor } }
            },
            animation: { duration: 500 }
        }
    });
}

function renderDepreciationChart(r, mode) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#8CA4BB' : '#8896A9';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    const years    = r.depSchedule.map(d => 'FY' + String(d.calYear).slice(-2) + '/' + String(d.calYear + 1).slice(-2));
    const div43Data = r.depSchedule.map(d => Math.round(d.div43 * 100) / 100);
    const div40Data = r.depSchedule.map(d => Math.round(d.div40 * 100) / 100);

    const allDatasets = {
        both: [
            { label: 'Div 43 — Building (2.5% straight line)', data: div43Data, backgroundColor: 'rgba(37,99,235,0.65)',  borderColor: 'rgba(37,99,235,0.9)',  borderWidth: 1 },
            { label: 'Div 40 — Plant & Equipment (DV)',         data: div40Data, backgroundColor: 'rgba(180,83,9,0.6)',    borderColor: 'rgba(180,83,9,0.85)',  borderWidth: 1 },
        ],
        div43: [
            { label: 'Div 43 — Building (2.5% straight line)', data: div43Data, backgroundColor: 'rgba(37,99,235,0.65)',  borderColor: 'rgba(37,99,235,0.9)',  borderWidth: 1 },
        ],
        div40: [
            { label: 'Div 40 — Plant & Equipment (DV)',         data: div40Data, backgroundColor: 'rgba(180,83,9,0.6)',    borderColor: 'rgba(180,83,9,0.85)',  borderWidth: 1 },
        ],
    };

    const ctx = document.getElementById('inv_depChart');
    if (inv_depChartInstance) inv_depChartInstance.destroy();
    inv_depChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: years, datasets: allDatasets[mode] || allDatasets.both },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true, position: 'top', labels: { color: textColor, font: { family: 'DM Sans', size: 11 }, boxWidth: 10, padding: 12 } },
                tooltip: { mode: 'index', intersect: false, callbacks: { label: c => ' ' + c.dataset.label + ': ' + fmt(c.raw) } }
            },
            scales: {
                x: { stacked: true, ticks: { color: textColor, maxTicksLimit: 20, font: { family: 'DM Sans', size: 10 } }, grid: { color: gridColor } },
                y: { stacked: true, ticks: { color: textColor, callback: v => '$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v), font: { family: 'DM Sans', size: 11 } }, grid: { color: gridColor } }
            },
            animation: { duration: 400 }
        }
    });
}

function fmtSigned(amount) {
    const abs = Math.abs(amount);
    const formatted = new Intl.NumberFormat('en-AU', {
        style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(abs);
    return (amount < 0 ? '−' : '+') + formatted;
}


function fmt(amount) {
    return new Intl.NumberFormat('en-AU', {
        style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(amount);
}
