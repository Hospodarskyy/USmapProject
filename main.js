async function init() {

  // ── Data loading ─────────────────────────────────────────────────────────────

  const [us, usCounties, electionRaw] = await Promise.all([
    fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/states-albers-10m.json").then(r => r.json()),
    fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-albers-10m.json").then(r => r.json()),
    d3.csv("data/2024_US_County_Level_Presidential_Results.csv", d => ({
      ...d,
      total_votes: +d.total_votes,
      votes_dem:   +d.votes_dem,
      votes_gop:   +d.votes_gop,
      per_dem:     +d.per_dem,
      per_gop:     +d.per_gop,
    }))
  ]);

  // ── Photo paths ───────────────────────────────────────────────────────────────

  const harrisPhoto = "img/harris.jpg";
  const trumpPhoto  = "img/trump.webp";

  // ── State-level aggregation ───────────────────────────────────────────────────

  const stateResults = (() => {
    const byState = d3.rollup(
      electionRaw,
      rows => ({
        votes_dem:   d3.sum(rows, d => d.votes_dem),
        votes_gop:   d3.sum(rows, d => d.votes_gop),
        total_votes: d3.sum(rows, d => d.total_votes),
        state_name:  rows[0].state_name
      }),
      d => String(d.county_fips).padStart(5, "0").slice(0, 2)
    );
    for (const [, d] of byState) {
      d.dem_pct = d.votes_dem / d.total_votes * 100;
      d.rep_pct = d.votes_gop / d.total_votes * 100;
      d.margin  = d.dem_pct - d.rep_pct;
    }
    return byState;
  })();

  // ── County results grouped by state FIPS ─────────────────────────────────────

  const countyResultsByState = d3.group(electionRaw, d =>
    String(d.county_fips).padStart(5, "0").slice(0, 2)
  );

  // ── Color scale ───────────────────────────────────────────────────────────────

  const colorScale = d3.scaleLinear()
    .domain([-40, 0, 40])
    .range(["#c0392b", "#e8e8e8", "#2980b9"])
    .clamp(true);

  // ── Tooltip (desktop only) ────────────────────────────────────────────────────

  const tooltip = d3.select("body").append("div")
    .style("position", "absolute")
    .style("background", "white")
    .style("border", "1px solid #ddd")
    .style("border-radius", "6px")
    .style("padding", "10px 14px")
    .style("pointer-events", "none")
    .style("font-size", "13px")
    .style("box-shadow", "0 2px 8px rgba(0,0,0,0.15)")
    .style("opacity", 0)
    .style("z-index", "100");

  // ── Bar chart for tooltip ─────────────────────────────────────────────────────

  function makeBarChart(result, harrisPhoto, trumpPhoto) {
    const w = 160, h = 260;
    const margin = { top: 15, right: 10, bottom: 80, left: 28 };
    const innerW = w - margin.left - margin.right;
    const innerH = h - margin.top - margin.bottom;

    const data = [
      { label: "Dem", name: "Harris", pct: result.dem_pct, color: "#2980b9", photo: harrisPhoto },
      { label: "Rep", name: "Trump",  pct: result.rep_pct, color: "#c0392b", photo: trumpPhoto  }
    ];

    const x = d3.scaleBand()
      .domain(data.map(d => d.label))
      .range([0, innerW])
      .padding(0.35);

    const maxPct = Math.max(result.dem_pct, result.rep_pct);
    const y = d3.scaleLinear()
      .domain([0, maxPct])
      .range([innerH, 0]);

    const svg = d3.create("svg")
      .attr("width", w)
      .attr("height", h);

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // 50% reference line (only if in range)
    const fiftyY = y(50);
    if (fiftyY >= 0 && fiftyY <= innerH) {
      g.append("line")
        .attr("x1", 0).attr("x2", innerW)
        .attr("y1", fiftyY).attr("y2", fiftyY)
        .attr("stroke", "#ccc")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3");

      g.append("text")
        .attr("x", innerW + 6)
        .attr("y", fiftyY)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "central")
        .style("font-size", "9px")
        .style("fill", "#aaa")
        .text("50%");
    }

    // Bars — animate up
    g.selectAll(".bar")
      .data(data)
      .join("rect")
      .attr("class", "bar")
      .attr("x", d => x(d.label))
      .attr("width", x.bandwidth())
      .attr("fill", d => d.color)
      .attr("rx", 2)
      .attr("y", innerH)
      .attr("height", 0)
      .transition()
      .duration(400)
      .ease(d3.easeCubicOut)
      .attr("y", d => y(d.pct))
      .attr("height", d => innerH - y(d.pct));

    // Percentage labels
    g.selectAll(".pct-label")
      .data(data)
      .join("text")
      .attr("class", "pct-label")
      .attr("x", d => x(d.label) + x.bandwidth() / 2)
      .attr("y", d => y(d.pct) - 4)
      .attr("text-anchor", "middle")
      .style("font-size", "11px")
      .style("font-weight", "500")
      .style("fill", d => d.color)
      .style("opacity", 0)
      .text(d => d.pct.toFixed(1) + "%")
      .transition().delay(350).duration(150)
      .style("opacity", 1);

    // Candidate photos
    const photoSize = 44;
    const photoY = innerH + 10;

    g.selectAll(".candidate-photo")
      .data(data)
      .join("image")
      .attr("class", "candidate-photo")
      .attr("href", d => d.photo)
      .attr("x", d => x(d.label) + x.bandwidth() / 2 - photoSize / 2)
      .attr("y", photoY)
      .attr("width", photoSize)
      .attr("height", photoSize)
      .attr("clip-path", "circle()");

    g.selectAll(".name-label")
      .data(data)
      .join("text")
      .attr("class", "name-label")
      .attr("x", d => x(d.label) + x.bandwidth() / 2)
      .attr("y", photoY + photoSize + 10)
      .attr("text-anchor", "middle")
      .style("font-size", "10px")
      .style("fill", d => d.color)
      .text(d => d.name);

    return svg.node();
  }

  // ── Map ───────────────────────────────────────────────────────────────────────

  const width = 975, height = 610;
  const isMobile = window.innerWidth < 600;

  const wrapper = d3.create("div")
    .style("position", "relative")
    .style("width", "100%");

  const svg = wrapper.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("width", "100%")
    .style("display", "block");

  // Desktop sidebar
  const sidebar = wrapper.append("div")
    .attr("id", "county-sidebar")
    .style("display", "none")
    .style("position", "absolute")
    .style("top", "0")
    .style("right", "0")
    .style("width", "220px")
    .style("height", "100%")
    .style("background", "white")
    .style("border-left", "0.5px solid #ddd")
    .style("overflow-y", "auto")
    .style("font-family", "sans-serif")
    .style("font-size", "12px");

  // Mobile panel (below map)
  const mobilePanel = wrapper.append("div")
    .attr("id", "mobile-panel")
    .style("display", "none")
    .style("width", "100%")
    .style("background", "white")
    .style("border-top", "0.5px solid #ddd")
    .style("font-family", "sans-serif")
    .style("font-size", "13px")
    .style("max-height", "400px")
    .style("overflow-y", "auto");

  const path = d3.geoPath();
  const states = topojson.feature(us, us.objects.states);

  const mapG = svg.append("g");
  let isZoomed = false;

  const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .filter(event => {
    if (event.type === "wheel") return true;
    if (event.type === "touchstart" || event.type === "touchmove") {
      return event.touches && event.touches.length >= 2;
    }
    return false;
  })
  .on("zoom", (event) => {
    mapG.attr("transform", event.transform);
    svg.select(".county-layer").attr("transform", event.transform);
  });

  svg.call(zoom);

  const backBtn = wrapper.append("button")
    .attr("id", "back-btn")
    .text("← Back")
    .style("display", "none")
    .style("position", "absolute")
    .style("top", "12px")
    .style("left", "12px")
    .style("z-index", "10")
    .style("background", "white")
    .style("border", "0.5px solid #ddd")
    .style("border-radius", "6px")
    .style("padding", "6px 12px")
    .style("cursor", "pointer")
    .style("font-size", "13px")
    .on("click", function() {
      isZoomed = false;

      if (isMobile) {
        mobilePanel.style("display", "none").html("");
        buildDefaultMobilePanel();
      } else {
        sidebar
          .style("transition", "transform 0.3s ease, opacity 0.3s ease")
          .style("transform", "translateX(220px)")
          .style("opacity", "0");
        setTimeout(() => {
          sidebar
            .style("display", "none")
            .style("transition", "")
            .style("transform", "")
            .style("opacity", "");
        }, 300);
      }

      svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);

      mapG.selectAll("path")
        .transition().duration(400)
        .attr("opacity", 1);

      svg.select(".county-layer")
        .transition().duration(300)
        .attr("opacity", 0)
        .remove();

      d3.select("#back-btn").style("display", "none");
    });

  mapG.selectAll("path")
    .data(states.features)
    .join("path")
    .attr("d", path)
    .attr("fill", d => {
      const fips = String(d.id).padStart(2, "0");
      const result = stateResults.get(fips);
      return result ? colorScale(result.margin) : "#ccc";
    })
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.5)
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
      if (isMobile || isZoomed) return;
      const fips = String(d.id).padStart(2, "0");
      const result = stateResults.get(fips);
      if (!result) return;

      const [cx, cy] = path.centroid(d);
      d3.select(this)
        .raise()
        .attr("stroke", "#333")
        .attr("stroke-width", 1.5)
        .transition().duration(150)
        .attr("transform", `translate(${cx},${cy}) scale(1.08) translate(${-cx},${-cy})`);

      const winner = result.margin > 0 ? "Harris" : "Trump";
      const margin = Math.abs(result.margin).toFixed(1);

      tooltip.style("opacity", 1).html("");

      tooltip.append("div")
        .style("font-weight", "500")
        .style("margin-bottom", "6px")
        .style("font-size", "13px")
        .text(result.state_name);

      tooltip.append("div")
        .style("font-size", "11px")
        .style("color", "#888")
        .style("margin-bottom", "8px")
        .text(`${winner} +${margin}%`);

      tooltip.node().appendChild(makeBarChart(result, harrisPhoto, trumpPhoto));
    })
    .on("mousemove", function(event) {
      if (isMobile) return;
      const tooltipWidth  = tooltip.node().offsetWidth;
      const tooltipHeight = tooltip.node().offsetHeight;
      const pageWidth     = document.documentElement.clientWidth;
      const pageHeight    = document.documentElement.clientHeight;

      const overflowsRight  = event.pageX + 12 + tooltipWidth  > pageWidth;
      const overflowsBottom = event.pageY - 28 + tooltipHeight > pageHeight;

      tooltip
        .style("left", overflowsRight
          ? (event.pageX - tooltipWidth - 12) + "px"
          : (event.pageX + 12) + "px")
        .style("top", overflowsBottom
          ? (event.pageY - tooltipHeight) + "px"
          : (event.pageY - 28) + "px");
    })
    .on("mouseout", function() {
      if (isMobile) return;
      d3.select(this)
        .transition().duration(150)
        .attr("transform", null)
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.5);
      tooltip.style("opacity", 0);
    })
    .on("click", function(event, d) {
      isZoomed = true;

      const fips = String(d.id).padStart(2, "0");
      const result = stateResults.get(fips);
      if (!result) return;

      // Desktop: animate tooltip flying to sidebar
      if (!isMobile) {
        const wrapperRect = wrapper.node().getBoundingClientRect();
        const tipRect     = tooltip.node().getBoundingClientRect();
        const targetX     = wrapperRect.right - wrapperRect.left - 30;
        const targetY     = tipRect.top - wrapperRect.top + window.scrollY - tipRect.height / 2;
        const deltaX      = targetX - (tipRect.left - wrapperRect.left);
        const deltaY      = targetY - (tipRect.top + window.scrollY - wrapperRect.top);

        tooltip
          .style("transition", "transform 0.35s ease, opacity 0.35s ease")
          .style("transform", `translate(${deltaX}px, ${deltaY}px) scale(0.4)`)
          .style("opacity", "0");

        sidebar
          .style("display", "block")
          .style("transform", "translateX(220px)")
          .style("opacity", "0")
          .style("transition", "transform 0.4s ease, opacity 0.4s ease");

        setTimeout(() => sidebar.style("transform", "translateX(0)").style("opacity", "1"), 200);
        setTimeout(() => tooltip.style("transition", "").style("transform", "").style("opacity", "0"), 400);
      }

      // Zoom — centered on mobile, shifted left on desktop
      const [[x0, y0], [x1, y1]] = path.bounds(d);
      const stateW = x1 - x0;
      const stateH = y1 - y0;

      const scale = Math.min(Math.min(width / stateW, height / stateH) * 0.75, 4);
      const tx = isMobile
        ? width / 2 - scale * (x0 + stateW / 2)
        : width * 0.4 - scale * (x0 + stateW / 2);
      const ty = height / 2 - scale * (y0 + stateH / 2);

      svg.transition().duration(600).call(
        zoom.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale)
      );

      mapG.selectAll("path")
        .transition().duration(400)
        .attr("opacity", dd => dd === d ? 1 : 0.15);

      // County geometry
      const countyFeatures = topojson
        .feature(usCounties, usCounties.objects.counties)
        .features
        .filter(f => String(f.id).padStart(5, "0").slice(0, 2) === fips);

      const countyDataMap = new Map(
        (countyResultsByState.get(fips) || [])
          .map(d => [String(d.county_fips).padStart(5, "0"), d])
      );

      const maxVotes    = d3.max(countyResultsByState.get(fips) || [], d => d.total_votes);
      const opacityScale = d3.scaleSqrt()
        .domain([0, maxVotes])
        .range([0.25, 1.0])
        .clamp(true);

      svg.select(".county-layer").remove();
      const countyLayer = svg.append("g").attr("class", "county-layer");

      // County name tooltip (desktop only)
      const countyTooltip = d3.select("body").append("div")
        .style("position", "absolute")
        .style("background", "white")
        .style("border", "1px solid #ddd")
        .style("border-radius", "4px")
        .style("padding", "4px 10px")
        .style("pointer-events", "none")
        .style("font-size", "12px")
        .style("font-family", "sans-serif")
        .style("box-shadow", "0 2px 6px rgba(0,0,0,0.12)")
        .style("opacity", 0)
        .style("z-index", "100");

      let selectedCounty = null;

      // County fills
      countyLayer.selectAll(".county-fill")
        .data(countyFeatures)
        .join("path")
        .attr("class", "county-fill")
        .attr("d", path)
        .attr("fill", d => {
          const r = countyDataMap.get(String(d.id).padStart(5, "0"));
          if (!r) return "#eee";
          return colorScale((r.per_dem - r.per_gop) * 100);
        })
        .attr("opacity", 0)
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.3)
        .style("cursor", "pointer")
        .on("mouseover", function(event, d) {
          if (isMobile || selectedCounty === d) return;
          const fipsC = String(d.id).padStart(5, "0");
          const r = countyDataMap.get(fipsC);
          const [cx, cy] = path.centroid(d);

          d3.select(this)
            .raise()
            .attr("stroke", "#333")
            .attr("stroke-width", 1)
            .transition().duration(150)
            .attr("transform", `translate(${cx},${cy}) scale(1.06) translate(${-cx},${-cy})`);

          const name = r
            ? r.county_name.charAt(0) + r.county_name.slice(1).toLowerCase()
            : "Unknown";
          countyTooltip.style("opacity", 1).text(name);
        })
        .on("mousemove", function(event) {
          if (isMobile) return;
          countyTooltip
            .style("left", (event.pageX + 10) + "px")
            .style("top",  (event.pageY - 28) + "px");
        })
        .on("mouseout", function(event, d) {
          if (isMobile || selectedCounty === d) return;
          d3.select(this)
            .transition().duration(150)
            .attr("transform", null)
            .attr("stroke", "#fff")
            .attr("stroke-width", 0.3);
          countyTooltip.style("opacity", 0);
        })
        .on("click", function(event, d) {
          event.stopPropagation();
          countyTooltip.style("opacity", 0);

          const fipsC = String(d.id).padStart(5, "0");
          const r     = countyDataMap.get(fipsC);
          if (!r) return;

          // Second click = deselect
          if (selectedCounty === d) {
            selectedCounty = null;

            countyLayer.selectAll(".county-fill")
              .transition().duration(200)
              .attr("transform", null)
              .attr("opacity", dd => {
                const rr = countyDataMap.get(String(dd.id).padStart(5, "0"));
                return rr ? opacityScale(rr.total_votes) : 0.25;
              })
              .attr("stroke", "#fff")
              .attr("stroke-width", 0.3);

            list.selectAll("div[id^='county-row-']")
              .style("background", "transparent");
            return;
          }

          selectedCounty = d;

          const idx = sorted.findIndex(s =>
            String(s.county_fips).padStart(5, "0") === fipsC
          );

          list.selectAll("div[id^='county-row-']").style("background", "transparent");

          if (idx !== -1) {
            const highlightColor = r.per_dem > r.per_gop ? "#e8f0f7" : "#f7e8e8";
            d3.select(`#county-row-${idx}`).style("background", highlightColor);
            const rowEl = document.getElementById(`county-row-${idx}`);
            if (rowEl) rowEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }

          countyLayer.selectAll(".county-fill")
            .transition().duration(200)
            .attr("transform", null)
            .attr("opacity", dd => {
              const f  = String(dd.id).padStart(5, "0");
              const rr = countyDataMap.get(f);
              return dd === d ? 1.0 : (rr ? opacityScale(rr.total_votes) * 0.3 : 0.1);
            })
            .attr("stroke",       dd => dd === d ? "#333" : "#fff")
            .attr("stroke-width", dd => dd === d ? 1.5   : 0.3);
        })
        .transition().delay(300).duration(400)
        .attr("opacity", d => {
          const r = countyDataMap.get(String(d.id).padStart(5, "0"));
          return r ? opacityScale(r.total_votes) : 0.25;
        });

      // ── Panel content (shared for desktop sidebar + mobile panel) ─────────────

      const counties    = countyResultsByState.get(fips) || [];
      const sorted      = [...counties]
        .sort((a, b) => b.total_votes - a.total_votes)
        .map((d, i) => ({ ...d, listIndex: i }));
      const demCounties = counties.filter(d => d.per_dem > d.per_gop).length;
      const repCounties = counties.filter(d => d.per_gop >= d.per_dem).length;
      const totalVotes  = d3.sum(counties, d => d.total_votes);

      const panel = isMobile ? mobilePanel : sidebar;

      if (isMobile) {
        mobilePanel
          .style("display", "block")
          .style("opacity", "0")
          .style("transition", "opacity 0.4s ease");
        setTimeout(() => mobilePanel.style("opacity", "1"), 50);
      }

      panel.html("");
      panel.node().scrollTop = 0;

      // Header
      panel.append("div")
        .style("padding", "10px 12px")
        .style("border-bottom", "0.5px solid #eee")
        .html(`
          <div style="font-weight:500;font-size:${isMobile ? "15px" : "13px"}">${result.state_name}</div>
          <div style="font-size:${isMobile ? "12px" : "11px"};color:#999;margin-top:2px">${counties.length} counties</div>
        `);

      // Candidate photos + stats
      const photoRow = panel.append("div")
        .style("display", "flex")
        .style("gap", "6px")
        .style("padding", "12px 12px 10px")
        .style("border-bottom", "0.5px solid #eee")
        .style("align-items", "flex-start")
        .style("justify-content", "center");

      const photoSize = isMobile ? "72px" : "56px";

      const harrisDiv = photoRow.append("div")
        .style("flex", "1").style("display", "flex")
        .style("flex-direction", "column").style("align-items", "center").style("gap", "4px");

      harrisDiv.append("img")
        .attr("src", harrisPhoto)
        .style("width", photoSize).style("height", photoSize)
        .style("border-radius", "50%").style("object-fit", "cover")
        .style("border", "2px solid #2980b9");

      harrisDiv.append("div")
        .style("font-size", isMobile ? "13px" : "11px")
        .style("color", "#2980b9").style("font-weight", "500").text("Harris");

      harrisDiv.append("div")
        .style("font-size", isMobile ? "18px" : "15px")
        .style("font-weight", "600").style("color", "#2980b9")
        .text(`${result.dem_pct.toFixed(1)}%`);

      harrisDiv.append("div")
        .style("font-size", isMobile ? "11px" : "9px").style("color", "#888")
        .text(`${demCounties} counties`);

      photoRow.append("div")
        .style("font-size", "11px").style("color", "#aaa")
        .style("font-weight", "500").style("margin-top", "22px").text("vs");

      const trumpDiv = photoRow.append("div")
        .style("flex", "1").style("display", "flex")
        .style("flex-direction", "column").style("align-items", "center").style("gap", "4px");

      trumpDiv.append("img")
        .attr("src", trumpPhoto)
        .style("width", photoSize).style("height", photoSize)
        .style("border-radius", "50%").style("object-fit", "cover")
        .style("border", "2px solid #c0392b");

      trumpDiv.append("div")
        .style("font-size", isMobile ? "13px" : "11px")
        .style("color", "#c0392b").style("font-weight", "500").text("Trump");

      trumpDiv.append("div")
        .style("font-size", isMobile ? "18px" : "15px")
        .style("font-weight", "600").style("color", "#c0392b")
        .text(`${result.rep_pct.toFixed(1)}%`);

      trumpDiv.append("div")
        .style("font-size", isMobile ? "11px" : "9px").style("color", "#888")
        .text(`${repCounties} counties`);

      // Total votes
      panel.append("div")
        .style("padding", "8px 12px")
        .style("border-bottom", "0.5px solid #eee")
        .style("display", "flex")
        .style("justify-content", "space-between")
        .style("font-size", isMobile ? "13px" : "11px")
        .html(`
          <span style="color:#999">Total votes</span>
          <span style="font-weight:500">${(totalVotes / 1e6).toFixed(1)}M</span>
        `);

      // County list label
      panel.append("div")
        .style("padding", "6px 12px 2px")
        .style("font-size", isMobile ? "11px" : "9px")
        .style("color", "#aaa")
        .style("letter-spacing", "0.04em")
        .text("COUNTIES BY VOTES");

      // County rows
      const list = panel.append("div").style("padding", "4px 12px 12px");

      sorted.forEach(county => {
        const demPct = county.per_dem * 100;
        const repPct = county.per_gop * 100;

        const row = list.append("div")
          .attr("id", `county-row-${county.listIndex}`)
          .style("margin-bottom", isMobile ? "12px" : "8px")
          .style("border-radius", "4px")
          .style("padding", "3px 4px")
          .style("transition", "background 0.2s")
          .style("cursor", "pointer");

        row.append("div")
          .style("display", "flex")
          .style("justify-content", "space-between")
          .style("margin-bottom", "3px")
          .html(`
            <span style="font-size:${isMobile ? "13px" : "11px"};color:#333">${county.county_name.charAt(0) + county.county_name.slice(1).toLowerCase()}</span>
            <span style="font-size:${isMobile ? "11px" : "9px"};color:#aaa">${county.total_votes > 1e6
              ? `${(county.total_votes / 1e6).toFixed(1)}M`
              : `${Math.round(county.total_votes / 1000)}k`} votes</span>
          `);

        const bar = row.append("div")
          .style("display", "flex").style("width", "100%")
          .style("height", isMobile ? "12px" : "8px")
          .style("border-radius", "3px")
          .style("overflow", "hidden").style("margin-bottom", "2px");

        bar.append("div")
          .style("width", `${demPct}%`).style("background", "#2980b9").style("height", "100%");

        bar.append("div")
          .style("width", `${repPct}%`).style("background", "#c0392b").style("height", "100%");

        row.append("div")
          .style("display", "flex")
          .style("justify-content", "space-between")
          .style("margin-bottom", "6px")
          .html(`
            <span style="font-size:${isMobile ? "11px" : "9px"};color:#2980b9">${demPct.toFixed(1)}%</span>
            <span style="font-size:${isMobile ? "11px" : "9px"};color:#c0392b">${repPct.toFixed(1)}%</span>
          `);

        row.on("click", function() {
          list.selectAll("div[id^='county-row-']").style("background", "transparent");

          const highlightColor = county.per_dem > county.per_gop ? "#e8f0f7" : "#f7e8e8";
          d3.select(`#county-row-${county.listIndex}`).style("background", highlightColor);

          const targetFips = String(county.county_fips).padStart(5, "0");

          countyLayer.selectAll(".county-fill")
            .transition().duration(200)
            .attr("opacity", dd => {
              const f  = String(dd.id).padStart(5, "0");
              const rr = countyDataMap.get(f);
              return f === targetFips ? 1.0 : (rr ? opacityScale(rr.total_votes) * 0.3 : 0.1);
            })
            .attr("stroke",       dd => String(dd.id).padStart(5, "0") === targetFips ? "#333" : "#fff")
            .attr("stroke-width", dd => String(dd.id).padStart(5, "0") === targetFips ? 1.5   : 0.3);
        });
      });

      d3.select("#back-btn").style("display", "block");
    });

  function buildDefaultMobilePanel() {
    const natDemVotes  = d3.sum([...stateResults.values()], d => d.votes_dem);
    const natRepVotes  = d3.sum([...stateResults.values()], d => d.votes_gop);
    const natTotal     = d3.sum([...stateResults.values()], d => d.total_votes);
    const natDemPct    = natDemVotes / natTotal * 100;
    const natRepPct    = natRepVotes / natTotal * 100;

    mobilePanel.style("display", "block").html("");

    mobilePanel.append("div")
      .style("padding", "12px 16px 8px")
      .style("border-bottom", "0.5px solid #eee")
      .html(`
        <div style="font-weight:600;font-size:16px;color:#222">2024 US Presidential Election</div>
        <div style="font-size:12px;color:#999;margin-top:3px">Popular vote results</div>
      `);

    const photoRow = mobilePanel.append("div")
      .style("display", "flex")
      .style("gap", "6px")
      .style("padding", "14px 16px")
      .style("border-bottom", "0.5px solid #eee")
      .style("align-items", "flex-start")
      .style("justify-content", "center");

    const harrisDiv = photoRow.append("div")
      .style("flex", "1").style("display", "flex")
      .style("flex-direction", "column").style("align-items", "center").style("gap", "4px");

    harrisDiv.append("img")
      .attr("src", harrisPhoto)
      .style("width", "72px").style("height", "72px")
      .style("border-radius", "50%").style("object-fit", "cover")
      .style("border", "2px solid #2980b9");

    harrisDiv.append("div")
      .style("font-size", "13px").style("color", "#2980b9").style("font-weight", "500")
      .text("Harris");

    harrisDiv.append("div")
      .style("font-size", "20px").style("font-weight", "600").style("color", "#2980b9")
      .text(`${natDemPct.toFixed(1)}%`);

    harrisDiv.append("div")
      .style("font-size", "11px").style("color", "#888")
      .text(`${(natDemVotes / 1e6).toFixed(1)}M votes`);

    photoRow.append("div")
      .style("font-size", "12px").style("color", "#aaa")
      .style("font-weight", "500").style("margin-top", "26px").text("vs");

    const trumpDiv = photoRow.append("div")
      .style("flex", "1").style("display", "flex")
      .style("flex-direction", "column").style("align-items", "center").style("gap", "4px");

    trumpDiv.append("img")
      .attr("src", trumpPhoto)
      .style("width", "72px").style("height", "72px")
      .style("border-radius", "50%").style("object-fit", "cover")
      .style("border", "2px solid #c0392b");

    trumpDiv.append("div")
      .style("font-size", "13px").style("color", "#c0392b").style("font-weight", "500")
      .text("Trump");

    trumpDiv.append("div")
      .style("font-size", "20px").style("font-weight", "600").style("color", "#c0392b")
      .text(`${natRepPct.toFixed(1)}%`);

    trumpDiv.append("div")
      .style("font-size", "11px").style("color", "#888")
      .text(`${(natRepVotes / 1e6).toFixed(1)}M votes`);

    const barWrap = mobilePanel.append("div")
      .style("padding", "0 16px 12px");

    const natBar = barWrap.append("div")
      .style("display", "flex").style("width", "100%")
      .style("height", "14px").style("border-radius", "4px")
      .style("overflow", "hidden").style("margin-bottom", "4px");

    natBar.append("div")
      .style("width", `${natDemPct}%`).style("background", "#2980b9").style("height", "100%");

    natBar.append("div")
      .style("width", `${natRepPct}%`).style("background", "#c0392b").style("height", "100%");

    barWrap.append("div")
      .style("display", "flex").style("justify-content", "space-between")
      .html(`
        <span style="font-size:11px;color:#2980b9">${natDemPct.toFixed(1)}%</span>
        <span style="font-size:11px;color:#c0392b">${natRepPct.toFixed(1)}%</span>
      `);

    mobilePanel.append("div")
      .style("padding", "10px 16px 14px")
      .style("font-size", "12px")
      .style("color", "#aaa")
      .style("text-align", "center")
      .text("Tap a state to explore county results");
  }

  // Mount map into page
  document.getElementById("map").appendChild(wrapper.node());

  // Show default panel on mobile load
  if (isMobile) buildDefaultMobilePanel();
}

init();