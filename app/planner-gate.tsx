'use client';

import dynamic from 'next/dynamic';

const Planner = dynamic(() => import('../src/Planner'), {
  ssr: false,
  loading: () => <div className="cloud-loading" role="status">正在載入 OpenPlan…</div>,
});

export default Planner;
