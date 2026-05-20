import { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';

const INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

const CHART_OPTIONS = {
  layout: {
    background: { color: '#080808' },
    textColor:  '#7a7a7a',
  },
  grid: {
    vertLines:   { color: '#111111' },
    horzLines:   { color: '#111111' },
  },
  crosshair: {
    vertLine: { color: '#c8a94e', labelBackgroundColor: '#1a1a1a' },
    horzLine: { color: '#c8a94e', labelBackgroundColor: '#1a1a1a' },
  },
  rightPriceScale: {
    borderColor: '#1c1c1c',
    textColor:   '#7a7a7a',
  },
  timeScale: {
    borderColor:      '#1c1c1c',
    timeVisible:      true,
    secondsVisible:   false,
    tickMarkFormatter: (time) => {
      const d = new Date(time * 1000);
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    },
  },
  handleScroll: true,
  handleScale:  true,
};

export default function PriceChart({ symbol, klines, interval, onIntervalChange }) {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const candleRef    = useRef(null);
  const volumeRef    = useRef(null);

  // Create chart on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...CHART_OPTIONS,
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor:       '#00e676',
      downColor:     '#ff3d57',
      borderVisible: false,
      wickUpColor:   '#00e676',
      wickDownColor: '#ff3d57',
    });

    const volumeSeries = chart.addHistogramSeries({
      color:        '#c8a94e',
      priceFormat:  { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current  = chart;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;

    // Responsive resize
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []);

  // Load klines data
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current || !klines.length) return;

    const sorted = [...klines].sort((a, b) => a.time - b.time);

    candleRef.current.setData(sorted);
    volumeRef.current.setData(
      sorted.map((k) => ({
        time:  k.time,
        value: k.volume,
        color: k.close >= k.open ? 'rgba(0,230,118,0.35)' : 'rgba(255,61,87,0.35)',
      })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [klines]);

  // Update last candle from stream
  useEffect(() => {
    if (!klines.length || !candleRef.current) return;
    const last = klines[klines.length - 1];
    if (!last) return;
    candleRef.current.update(last);
    volumeRef.current?.update({
      time:  last.time,
      value: last.volume,
      color: last.close >= last.open ? 'rgba(0,230,118,0.35)' : 'rgba(255,61,87,0.35)',
    });
  }, [klines]);

  return (
    <div className="panel" style={{ height: '100%', position: 'relative' }}>
      {/* Header */}
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <span className="panel-title">
          <span className="text-amber">{symbol}</span>
          <span className="text-dim" style={{ marginLeft: 8 }}>Candlestick</span>
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              className={`btn ${interval === iv ? 'btn-active' : ''}`}
              style={{ padding: '1px 6px', fontSize: 10 }}
              onClick={() => onIntervalChange(iv)}
            >
              {iv}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div
        ref={containerRef}
        style={{ flex: 1, width: '100%', height: 'calc(100% - 24px)' }}
      />
    </div>
  );
}
