import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

let xScale, yScale;

async function loadData() {
  return await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));
}

function processCommits(data) {
  return d3.groups(data, (d) => d.commit).map(([commit, lines]) => {
    let { author, date, time, timezone, datetime } = lines[0];
    let ret = {
      id: commit,
      url: 'https://github.com/shriyakonda/portfolio/commit/' + commit,
      author, date, time, timezone, datetime,
      hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
      totalLines: lines.length,
    };
    Object.defineProperty(ret, 'lines', { value: lines, enumerable: false });
    return ret;
  });
}

function renderCommitInfo(data, commits) {
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');
  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(data.length);
  dl.append('dt').text('Commits');
  dl.append('dd').text(commits.length);
  dl.append('dt').text('Files');
  dl.append('dd').text(d3.group(data, (d) => d.file).size);
  dl.append('dt').text('Max depth');
  dl.append('dd').text(d3.max(data, (d) => d.depth));
  dl.append('dt').text('Avg line length');
  dl.append('dd').text(d3.mean(data, (d) => d.length).toFixed(1));
}

function renderTooltipContent(commit) {
  if (!commit.id) return;
  document.getElementById('commit-link').href = commit.url;
  document.getElementById('commit-link').textContent = commit.id;
  document.getElementById('commit-date').textContent = commit.datetime?.toLocaleString('en', { dateStyle: 'full' });
  document.getElementById('commit-time').textContent = commit.datetime?.toLocaleString('en', { timeStyle: 'short' });
  document.getElementById('commit-author').textContent = commit.author;
  document.getElementById('commit-lines').textContent = commit.totalLines;
}
const updateTooltipVisibility = (v) => document.getElementById('commit-tooltip').hidden = !v;
const updateTooltipPosition = (e) => {
  const t = document.getElementById('commit-tooltip');
  t.style.left = `${e.clientX}px`; t.style.top = `${e.clientY}px`;
};

function isCommitSelected(selection, commit) {
  if (!selection) return false;
  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime), y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function renderSelectionCount(selection, commits) {
  const sel = selection ? commits.filter((d) => isCommitSelected(selection, d)) : [];
  document.querySelector('#selection-count').textContent = `${sel.length || 'No'} commits selected`;
}

function renderLanguageBreakdown(selection, commits) {
  const sel = selection ? commits.filter((d) => isCommitSelected(selection, d)) : [];
  const container = document.getElementById('language-breakdown');
  if (sel.length === 0) { container.innerHTML = ''; return; }
  const lines = sel.flatMap((d) => d.lines);
  const breakdown = d3.rollup(lines, (v) => v.length, (d) => d.type);
  container.innerHTML = '';
  for (const [lang, count] of breakdown) {
    const pct = d3.format('.1~%')(count / lines.length);
    container.innerHTML += `<dt>${lang}</dt><dd>${count} lines (${pct})</dd>`;
  }
}

function renderScatterPlot(data, commits) {
  const width = 1000, height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 40 };
  const usable = {
    top: margin.top, right: width - margin.right,
    bottom: height - margin.bottom, left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3.select('#chart').append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`).style('overflow', 'visible');

  xScale = d3.scaleTime().domain(d3.extent(commits, (d) => d.datetime))
    .range([usable.left, usable.right]).nice();
  yScale = d3.scaleLinear().domain([0, 24]).range([usable.bottom, usable.top]);

  svg.append('g').attr('class', 'gridlines')
    .attr('transform', `translate(${usable.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usable.width));

  svg.append('g').attr('transform', `translate(0, ${usable.bottom})`).call(d3.axisBottom(xScale));
  svg.append('g').attr('transform', `translate(${usable.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat((d) => String(d % 24).padStart(2, '0') + ':00'));

  const [minL, maxL] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minL, maxL]).range([2, 30]);
  const sorted = d3.sort(commits, (d) => -d.totalLines);

  svg.append('g').attr('class', 'dots').selectAll('circle').data(sorted).join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue').style('fill-opacity', 0.7)
    .on('mouseenter', (e, c) => {
      d3.select(e.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(c); updateTooltipVisibility(true); updateTooltipPosition(e);
    })
    .on('mouseleave', (e) => {
      d3.select(e.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });

  svg.call(d3.brush().on('start brush end', (event) => {
    const sel = event.selection;
    d3.selectAll('circle').classed('selected', (d) => isCommitSelected(sel, d));
    renderSelectionCount(sel, commits);
    renderLanguageBreakdown(sel, commits);
  }));
  svg.selectAll('.dots, .overlay ~ *').raise();
}

const data = await loadData();
const commits = processCommits(data);
renderCommitInfo(data, commits);
renderScatterPlot(data, commits);