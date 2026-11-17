const values = [3, 7, 4, 9, 6, 8];

// Only used inside @defer, so it is split into its own chunk and loaded lazily.
export function HeavyChart() @{
  <figure id="chart">
    <div class="bars">
      @for (const value of values; index i; key i) {
        <span class="bar" style:height={`${value * 10}px`}></span>
      }
    </div>
    <figcaption>{'Loaded lazily by @defer (on viewport)'}</figcaption>
    <style>
      .bars { display: flex; gap: 4px; align-items: flex-end; height: 100px; }
      .bar { width: 20px; background: #6b7cff; }
    </style>
  </figure>
}
