import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';
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
  const commits = d3.groups(data, (d) => d.commit).map(([commit, lines]) => {
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
  commits.sort((a, b) => a.datetime - b.datetime);
  return commits;
}
function renderCommitInfo(data, commits) {
  d3.select('#stats').selectAll('*').remove();
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');
  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(data.length);
  dl.append('dt').text('Commits');
  dl.append('dd').text(commits.length);
  dl.append('dt').text('Files');
  dl.append('dd').text(d3.group(commits.flatMap(c => c.lines), (d) => d.file).size);
  dl.append('dt').text('Max depth');
  dl.append('dd').text(d3.max(commits.flatMap(c => c.lines), (d) => d.depth));
  dl.append('dt').text('Avg line length');
  dl.append('dd').text(d3.mean(commits.flatMap(c => c.lines), (d) => d.length).toFixed(1));
}
function renderTooltipContent(commit) {
  if (!commit.id) return;
  document.getElementById('commit-link').href = commit.url;
  document.getElementById('commit-link').textContent = commit.id;
  document.getElementById('commit-date').textContent = commit.datetime?.toLocaleString('en', { dateStyle: 'full' });
  document.getElementById('commit-time-tooltip').textContent = commit.datetime?.toLocaleString('en', { timeStyle: 'short' });
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
  svg.append('g')
    .attr('transform', `translate(0, ${usable.bottom})`)
    .attr('class', 'x-axis')
    .call(d3.axisBottom(xScale));
  svg.append('g')
    .attr('transform', `translate(${usable.left}, 0)`)
    .attr('class', 'y-axis')
    .call(d3.axisLeft(yScale).tickFormat((d) => String(d % 24).padStart(2, '0') + ':00'));
  const [minL, maxL] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minL, maxL]).range([2, 30]);
  const sorted = d3.sort(commits, (d) => -d.totalLines);
  svg.append('g').attr('class', 'dots').selectAll('circle').data(sorted, (d) => d.id).join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .style('--r', (d) => rScale(d.totalLines))
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
function updateScatterPlot(data, commits) {
  const svg = d3.select('#chart').select('svg');
  xScale = xScale.domain(d3.extent(commits, (d) => d.datetime));
  const [minL, maxL] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minL, maxL]).range([2, 30]);
  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(d3.axisBottom(xScale));
  const dots = svg.select('g.dots');
  const sorted = d3.sort(commits, (d) => -d.totalLines);
  dots.selectAll('circle').data(sorted, (d) => d.id).join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .style('--r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue').style('fill-opacity', 0.7)
    .on('mouseenter', (e, c) => {
      d3.select(e.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(c); updateTooltipVisibility(true); updateTooltipPosition(e);
    })
    .on('mouseleave', (e) => {
      d3.select(e.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });
}
function updateFileDisplay(filteredCommits) {
  const lines = filteredCommits.flatMap((d) => d.lines);
  const files = d3.groups(lines, (d) => d.file)
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => b.lines.length - a.lines.length);
  const filesContainer = d3.select('#files').selectAll('div').data(files, (d) => d.name)
    .join((enter) => enter.append('div').call((div) => {
      div.append('dt').append('code');
      div.append('dd');
    }));
  filesContainer.select('dt > code').html((d) => `${d.name}<small>${d.lines.length} lines</small>`);
  filesContainer.select('dd').selectAll('div').data((d) => d.lines).join('div')
    .attr('class', 'loc')
    .attr('style', (d) => `--color: ${colors(d.type)}`);
}
const data = await loadData();
const commits = processCommits(data);
let commitProgress = 100;
let timeScale = d3.scaleTime()
  .domain([d3.min(commits, (d) => d.datetime), d3.max(commits, (d) => d.datetime)])
  .range([0, 100]);
let commitMaxTime = timeScale.invert(commitProgress);
let filteredCommits = commits;
let colors = d3.scaleOrdinal(d3.schemeTableau10);
renderCommitInfo(data, commits);
renderScatterPlot(data, commits);
function onTimeSliderChange() {
  commitProgress = +document.getElementById('commit-progress').value;
  commitMaxTime = timeScale.invert(commitProgress);
  document.getElementById('commit-time').textContent =
    commitMaxTime.toLocaleString('en', { dateStyle: 'long', timeStyle: 'short' });
  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
  updateScatterPlot(data, filteredCommits);
  updateFileDisplay(filteredCommits);
  renderCommitInfo(data, filteredCommits);
}
document.getElementById('commit-progress').addEventListener('input', onTimeSliderChange);
onTimeSliderChange();
d3.select('#scatter-story').selectAll('.step').data(commits).join('div').attr('class', 'step')
  .html((d, i) => `
    On ${d.datetime.toLocaleString('en', { dateStyle: 'full', timeStyle: 'short' })},
    I made <a href="${d.url}" target="_blank">${i > 0 ? 'another glorious commit' : 'my first commit, and it was glorious'}</a>.
    I edited ${d.totalLines} lines across ${d3.rollups(d.lines, (D) => D.length, (d) => d.file).length} files.
    Then I looked over all I had made, and I saw that it was very good.
  `);
function onStepEnter(response) {
  const commitDatetime = response.element.__data__.datetime;
  filteredCommits = commits.filter((d) => d.datetime <= commitDatetime);
  updateScatterPlot(data, filteredCommits);
  updateFileDisplay(filteredCommits);
  renderCommitInfo(data, filteredCommits);
}
scrollama().setup({ container: '#scrolly-1', step: '#scrolly-1 .step' }).onStepEnter(onStepEnter);