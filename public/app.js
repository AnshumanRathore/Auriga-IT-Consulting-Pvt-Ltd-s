(function () {
  const showSelect = document.getElementById('show-select');
  const showHint = document.getElementById('show-hint');
  const tiersEl = document.getElementById('tiers');
  const festivalToggle = document.getElementById('festival-toggle');
  const memberToggle = document.getElementById('member-toggle');
  const bookBtn = document.getElementById('book-btn');
  const resetBtn = document.getElementById('reset-btn');
  const statusEl = document.getElementById('status');
  const clockEl = document.getElementById('clock');

  const receiptEmpty = document.getElementById('receipt-empty');
  const receiptBody = document.getElementById('receipt-body');
  const receiptTitle = document.getElementById('receipt-title');
  const receiptSub = document.getElementById('receipt-sub');
  const receiptLines = document.getElementById('receipt-lines');
  const receiptSummary = document.getElementById('receipt-summary');
  const receiptTotal = document.getElementById('receipt-total');

  /** @type {any[]} */
  let allShows = [];
  let currentShow = null;
  /** @type {Record<string, number>} */
  let quantities = {};
  let debounceHandle = null;

  function formatPaise(paise) {
    const abs = Math.abs(paise);
    const rupees = Math.floor(abs / 100);
    const p = abs % 100;
    const grouped = rupees.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${paise < 0 ? '-' : ''}\u20B9${grouped}.${p.toString().padStart(2, '0')}`;
  }

  function tickClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleString('en-IN', {
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  tickClock();
  setInterval(tickClock, 30_000);

  function setStatus(message, tone) {
    statusEl.textContent = message || '';
    if (tone) statusEl.setAttribute('data-tone', tone);
    else statusEl.removeAttribute('data-tone');
  }

  async function loadShows() {
    const res = await fetch('/api/v1/shows');
    const data = await res.json();
    allShows = data.shows;
    showSelect.innerHTML = allShows
      .map((s) => `<option value="${s.id}">${s.title} — ${s.screen}</option>`)
      .join('');
    selectShow(allShows[0]?.id);
  }

  function selectShow(showId) {
    currentShow = allShows.find((s) => s.id === showId) || null;
    quantities = {};
    if (!currentShow) return;
    showSelect.value = currentShow.id;
    const when = new Date(currentShow.startTime);
    showHint.textContent = `${when.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · ${when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    renderTiers();
    renderReceipt(null);
  }

  function renderTiers() {
    tiersEl.innerHTML = currentShow.tiers
      .map((t) => {
        const qty = quantities[t.name] || 0;
        const soldOut = t.soldOut;
        return `
        <div class="tier-card ${soldOut ? 'tier-card--soldout' : ''}" data-tier="${t.name}">
          <div>
            <div class="tier-card__name">${t.name}</div>
            <div class="tier-card__meta">${soldOut ? 'Sold out' : `${t.availableSeats} left`}</div>
          </div>
          <div class="tier-card__price">${formatPaise(t.pricePaise)}</div>
          ${
            soldOut
              ? '<span class="soldout-badge">Full</span>'
              : `<div class="qty">
                  <button type="button" data-action="dec" data-tier="${t.name}" ${qty === 0 ? 'disabled' : ''}>-</button>
                  <span class="qty__count">${qty}</span>
                  <button type="button" data-action="inc" data-tier="${t.name}" ${qty >= t.availableSeats ? 'disabled' : ''}>+</button>
                </div>`
          }
        </div>`;
      })
      .join('');
  }

  tiersEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const tierName = btn.dataset.tier;
    const tier = currentShow.tiers.find((t) => t.name === tierName);
    const current = quantities[tierName] || 0;
    if (btn.dataset.action === 'inc' && current < tier.availableSeats) {
      quantities[tierName] = current + 1;
    } else if (btn.dataset.action === 'dec' && current > 0) {
      quantities[tierName] = current - 1;
    }
    renderTiers();
    scheduleQuote();
  });

  showSelect.addEventListener('change', () => selectShow(showSelect.value));
  festivalToggle.addEventListener('change', scheduleQuote);
  memberToggle.addEventListener('change', scheduleQuote);

  resetBtn.addEventListener('click', () => {
    quantities = {};
    festivalToggle.checked = false;
    memberToggle.checked = false;
    renderTiers();
    renderReceipt(null);
    setStatus('');
  });

  function currentLines() {
    return Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([tierName, quantity]) => ({ tierName, quantity }));
  }

  function scheduleQuote() {
    bookBtn.disabled = true;
    clearTimeout(debounceHandle);
    debounceHandle = setTimeout(fetchQuote, 180);
  }

  async function fetchQuote() {
    const lines = currentLines();
    if (lines.length === 0) {
      renderReceipt(null);
      setStatus('');
      return;
    }
    setStatus('Pricing…');
    try {
      const res = await fetch(`/api/v1/shows/${currentShow.id}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines,
          applyFestivalDiscount: festivalToggle.checked,
          isMember: memberToggle.checked,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = (data.errors || []).map((e) => e.message).join(' ') || data.error?.message || 'Could not price this booking.';
        setStatus(msg);
        renderReceipt(null);
        bookBtn.disabled = true;
        return;
      }
      setStatus('Quote ready.', 'good');
      renderReceipt(data.breakup);
      bookBtn.disabled = false;
    } catch (err) {
      setStatus('Network error — is the server running?');
      renderReceipt(null);
    }
  }

  bookBtn.addEventListener('click', async () => {
    const lines = currentLines();
    if (lines.length === 0) return;
    bookBtn.disabled = true;
    setStatus('Booking…');
    try {
      const res = await fetch(`/api/v1/shows/${currentShow.id}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines,
          applyFestivalDiscount: festivalToggle.checked,
          isMember: memberToggle.checked,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = (data.errors || []).map((e) => e.message).join(' ') || 'Booking failed.';
        setStatus(msg);
        bookBtn.disabled = false;
        return;
      }
      setStatus(`Booked — ${data.bookingId}`, 'good');
      renderReceipt(data.breakup);
      await loadShows(); // refresh availability
      selectShow(currentShow.id);
    } catch (err) {
      setStatus('Network error — is the server running?');
      bookBtn.disabled = false;
    }
  });

  function renderReceipt(breakup) {
    if (!breakup) {
      receiptEmpty.hidden = false;
      receiptBody.hidden = true;
      return;
    }
    receiptEmpty.hidden = true;
    receiptBody.hidden = false;

    receiptTitle.textContent = currentShow.title;
    receiptSub.textContent = `${currentShow.screen} · ${new Date(currentShow.startTime).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })}`;

    receiptLines.innerHTML = breakup.lines
      .map(
        (l) => `
      <div class="receipt__line">
        <div class="receipt__line-head"><span>${l.tierName} x${l.quantity}</span><span>${formatPaise(l.grossAmountPaise)}</span></div>
        ${l.discountAppliedPaise > 0 ? `<div class="receipt__line-row"><span>Discount</span><span>-${formatPaise(l.discountAppliedPaise)}</span></div>` : ''}
        <div class="receipt__line-row"><span>Taxable value</span><span>${formatPaise(l.taxableAmountPaise)}</span></div>
        <div class="receipt__line-row"><span>Convenience fee</span><span>${formatPaise(l.convenienceFeePaise)}</span></div>
        <div class="receipt__line-row"><span>GST (${l.gstPercent}%)</span><span>${formatPaise(l.gstPaise)}</span></div>
        <div class="receipt__line-row" style="color:var(--paper-text); font-weight:600;"><span>Line total</span><span>${formatPaise(l.lineTotalPaise)}</span></div>
      </div>`
      )
      .join('');

    const s = breakup.summary;
    receiptSummary.innerHTML = `
      <div class="receipt__line-row"><span>Gross amount</span><span>${formatPaise(s.grossAmountPaise)}</span></div>
      <div class="receipt__line-row"><span>Festival discount</span><span>-${formatPaise(s.festivalDiscountAppliedPaise)}</span></div>
      <div class="receipt__line-row"><span>Member discount</span><span>-${formatPaise(s.memberDiscountAppliedPaise)}</span></div>
      <div class="receipt__line-row"><span>Taxable amount</span><span>${formatPaise(s.taxableAmountPaise)}</span></div>
      <div class="receipt__line-row"><span>Convenience fee</span><span>${formatPaise(s.totalConvenienceFeePaise)}</span></div>
      <div class="receipt__line-row"><span>GST</span><span>${formatPaise(s.totalGstPaise)}</span></div>
    `;

    receiptTotal.innerHTML = `<span>Grand total</span><span>${formatPaise(s.grandTotalPaise)}</span>`;
  }

  loadShows();
})();
