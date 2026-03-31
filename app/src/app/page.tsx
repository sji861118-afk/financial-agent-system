"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).style.animationPlayState = "running";
            e.target.classList.add("vis");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    const cards = document.querySelectorAll<HTMLElement>(".why-card, .feat-card");
    cards.forEach((el) => {
      el.style.opacity = "0";
      el.style.animation = "fadeUp .6s ease-out forwards";
      el.style.animationPlayState = "paused";
      obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const toggleFaq = (idx: number) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  const faqItems = [
    {
      q: "DART 데이터는 어떻게 연동되나요?",
      a: "금융감독원 DART 전자공시시스템의 Open API를 통해 실시간으로 연동됩니다. 재무제표, 감사보고서 등 공시 데이터를 기업명 검색만으로 즉시 조회할 수 있습니다.",
    },
    {
      q: "비상장 법인도 조회 가능한가요?",
      a: "네, 외부감사 대상 비상장 법인의 경우 DART에 감사보고서가 공시되어 있어 조회 가능합니다. 감사보고서 XML 파싱을 통해 정확한 재무데이터를 추출합니다.",
    },
    {
      q: "감정평가서 PDF는 어떤 형식을 지원하나요?",
      a: "국내 주요 감정평가법인의 표준 감정평가서 PDF를 지원합니다. AI가 담보 물건 정보, 감정가액, 비준사례, 시장 분석 데이터를 자동으로 추출합니다.",
    },
    {
      q: "생성된 Excel은 어떤 형식인가요?",
      a: "은행 여신심사 실무에서 사용하는 서식에 맞추어 재무상태표(BS), 손익계산서(IS), 재무비율, 총차입금/순차입금 현황이 포함된 다중 시트 Excel 파일로 생성됩니다.",
    },
    {
      q: "데이터 보안은 어떻게 관리되나요?",
      a: "사용자별 접근 권한 관리, 전체 조회 이력 로깅, 관리자 감사 추적 기능을 제공합니다. 관리자 대시보드에서 사용자 활동을 실시간으로 모니터링할 수 있습니다.",
    },
    {
      q: "업로드한 재무제표 파일(PDF/Excel)도 분석할 수 있나요?",
      a: "네, DART 조회 외에도 직접 보유한 재무제표 PDF나 Excel 파일을 업로드하여 분석할 수 있습니다. 여러 파일을 동시에 업로드하면 연도별로 자동 병합하여 BS/IS를 정리합니다.",
    },
  ];

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=Instrument+Serif:ital@0;1&family=Noto+Sans+KR:wght@300;400;500;600;700;800&display=swap');

        :root{
          --bg:#f5f6f8;--bg-white:#fff;--text-primary:#0f172a;--text-secondary:#475569;
          --text-muted:#94a3b8;--border:#e2e8f0;--border-light:#f1f5f9;
          --accent:#1e293b;--blue:#3b82f6;--green:#22c55e;--green-light:#dcfce7;
          --red:#ef4444;--orange:#f59e0b;--purple:#8b5cf6;--indigo:#4f46e5;
          --shadow-sm:0 1px 2px rgba(0,0,0,.04);--shadow-md:0 4px 16px rgba(0,0,0,.06);
          --shadow-lg:0 8px 32px rgba(0,0,0,.08);--shadow-xl:0 16px 48px rgba(0,0,0,.10);
          --radius:12px;--radius-lg:16px;--radius-xl:24px;
          --font-kr:'Noto Sans KR','DM Sans',sans-serif;
          --font-en:'DM Sans','Noto Sans KR',sans-serif;
          --font-serif:'Instrument Serif',Georgia,serif;
          --nav-h:72px;
        }
        .landing-root{font-family:var(--font-kr);background:var(--bg);color:var(--text-primary);line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden;min-height:100vh;width:100%;display:block;flex:none}
        .landing-root *,.landing-root *::before,.landing-root *::after{margin:0;padding:0;box-sizing:border-box}
        .landing-root a{text-decoration:none;color:inherit}.landing-root button{font-family:inherit;cursor:pointer;border:none;background:none}.landing-root ul{list-style:none}

        @keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        @keyframes scaleIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
        @keyframes barGrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
        .anim-up{animation:fadeUp .7s ease-out both}
        .anim-d1{animation-delay:.1s}.anim-d2{animation-delay:.2s}.anim-d3{animation-delay:.3s}.anim-d4{animation-delay:.4s}

        .container{max-width:1200px;margin:0 auto;padding:0 24px}

        .nav{position:fixed;top:0;left:0;right:0;height:var(--nav-h);background:rgba(255,255,255,.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid var(--border);z-index:1000;transition:box-shadow .3s}
        .nav.scrolled{box-shadow:var(--shadow-md)}
        .nav-inner{max-width:1200px;margin:0 auto;padding:0 24px;height:100%;display:flex;align-items:center;justify-content:space-between}
        .nav-logo{display:flex;align-items:center;gap:10px;font-family:var(--font-en);font-weight:700;font-size:22px;color:var(--text-primary)}
        .nav-logo-icon{width:36px;height:36px;background:linear-gradient(135deg,#4f46e5,#3b82f6);border-radius:10px;display:flex;align-items:center;justify-content:center}
        .nav-logo-icon svg{width:20px;height:20px;color:#fff}
        .nav-links{display:flex;align-items:center;gap:28px}
        .nav-links a{font-size:14px;font-weight:500;color:var(--text-secondary);transition:color .2s}
        .nav-links a:hover,.nav-links a.active{color:var(--text-primary)}
        .nav-links a .en{font-family:var(--font-en);font-size:12px;color:var(--text-muted);margin-left:4px}
        .nav-login{padding:9px 22px;background:var(--indigo);color:#fff;border-radius:8px;font-size:14px;font-weight:600;transition:all .2s}
        .nav-login:hover{background:#4338ca;transform:translateY(-1px);box-shadow:var(--shadow-md)}

        .hero{padding-top:calc(var(--nav-h) + 72px);padding-bottom:48px;text-align:center;background:linear-gradient(180deg,#fff 0%,var(--bg) 100%);position:relative;overflow:hidden}
        .hero::before{content:'';position:absolute;top:80px;left:50%;transform:translateX(-50%);width:900px;height:900px;background:radial-gradient(circle,rgba(79,70,229,.05) 0%,transparent 65%);pointer-events:none}
        .hero-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 16px;background:#fff;border:1px solid var(--border);border-radius:20px;font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:20px}
        .hero-badge span{width:6px;height:6px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
        .hero-title{font-size:clamp(32px,4.8vw,52px);font-weight:700;line-height:1.2;margin-bottom:20px;letter-spacing:-.02em}
        .hero-title em{font-family:var(--font-serif);font-style:italic;font-weight:400;color:var(--indigo)}
        .hero-sub{font-size:16px;color:var(--text-secondary);max-width:540px;margin:0 auto 32px;line-height:1.8}
        .hero-actions{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:64px}
        .btn-primary{padding:13px 32px;background:var(--accent);color:#fff;border-radius:10px;font-size:14px;font-weight:600;transition:all .25s;border:1.5px solid var(--accent)}
        .btn-primary:hover{background:#334155;transform:translateY(-1px);box-shadow:var(--shadow-md)}
        .btn-ghost{padding:13px 32px;background:#fff;color:var(--text-primary);border-radius:10px;font-size:14px;font-weight:600;border:1.5px solid var(--border);transition:all .25s}
        .btn-ghost:hover{border-color:var(--text-secondary);transform:translateY(-1px)}

        .dash-wrap{max-width:1100px;margin:0 auto}
        .dash{background:var(--bg-white);border-radius:var(--radius-xl);box-shadow:var(--shadow-xl),0 0 0 1px rgba(0,0,0,.04);overflow:hidden;display:flex;min-height:500px;animation:scaleIn .8s .3s ease-out both}

        .ds{width:196px;background:#fff;border-right:1px solid var(--border);padding:20px 0;flex-shrink:0;display:flex;flex-direction:column}
        .ds-logo{display:flex;align-items:center;gap:8px;padding:0 16px;margin-bottom:20px;font-weight:700;font-size:14px;font-family:var(--font-en)}
        .ds-logo i{width:26px;height:26px;background:linear-gradient(135deg,#4f46e5,#3b82f6);border-radius:7px;display:flex;align-items:center;justify-content:center}
        .ds-logo i svg{width:14px;height:14px;color:#fff}
        .ds-label{font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;padding:0 16px;margin:14px 0 6px}
        .ds-item{display:flex;align-items:center;gap:9px;padding:8px 16px;font-size:12.5px;color:var(--text-secondary);cursor:default;transition:all .15s}
        .ds-item:hover{background:var(--border-light);color:var(--text-primary)}
        .ds-item.active{background:#eef2ff;color:#4338ca;font-weight:600}
        .ds-item svg{width:15px;height:15px;flex-shrink:0}
        .ds-item .ko{margin-right:2px}
        .ds-item .en{font-family:var(--font-en);font-size:10px;color:var(--text-muted)}
        .ds-cta{margin:auto 12px 12px;padding:14px;background:linear-gradient(135deg,#eef2ff,#e0e7ff);border-radius:var(--radius);text-align:center}
        .ds-cta h4{font-size:12px;font-weight:700;color:#312e81;margin-bottom:4px}
        .ds-cta p{font-size:10px;color:var(--text-secondary);margin-bottom:8px;line-height:1.4}
        .ds-cta a{display:inline-block;padding:5px 14px;background:#4338ca;color:#fff;border-radius:6px;font-size:11px;font-weight:600}

        .dm{flex:1;background:#f8fafc;padding:18px;overflow:hidden}
        .dm-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
        .dm-head h2{font-size:15px;font-weight:700}
        .dm-head p{font-size:11px;color:var(--text-muted)}
        .dm-head-r{display:flex;align-items:center;gap:10px}
        .dm-search{display:flex;align-items:center;gap:5px;padding:5px 10px;background:#fff;border:1px solid var(--border);border-radius:7px;font-size:11px;color:var(--text-muted)}
        .dm-search svg{width:13px;height:13px}
        .dm-avatar{width:30px;height:30px;border-radius:50%;background:var(--indigo);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff}
        .dm-user span{font-size:11px;font-weight:600}
        .dm-user small{font-size:9px;color:var(--text-muted);display:block}

        .dm-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
        .st{background:#fff;border-radius:var(--radius);padding:14px;border:1px solid var(--border-light);text-align:center}
        .st-val{font-size:26px;font-weight:700;line-height:1.2;font-family:var(--font-en)}
        .st-lbl{font-size:10px;color:var(--text-muted);margin-top:2px}

        .dm-charts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
        .cc{background:#fff;border-radius:var(--radius);padding:14px;border:1px solid var(--border-light)}
        .cc-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
        .cc-title{font-size:12px;font-weight:700}
        .cc-sub{font-size:10px;color:var(--text-muted)}
        .cc-dots{display:flex;gap:2px;padding:4px}.cc-dots span{width:3px;height:3px;background:var(--text-muted);border-radius:50%}

        .ratio-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .ratio-item{text-align:center;padding:6px}
        .ratio-val{font-size:20px;font-weight:700;font-family:var(--font-en)}
        .ratio-val.good{color:var(--green)}.ratio-val.warn{color:var(--orange)}.ratio-val.bad{color:var(--red)}
        .ratio-lbl{font-size:10px;color:var(--text-muted)}

        .donut-wrap{display:flex;align-items:center;gap:14px}
        .donut-svg{width:90px;height:90px;flex-shrink:0}
        .donut-leg{font-size:10px;color:var(--text-secondary)}
        .donut-leg-item{display:flex;align-items:center;gap:5px;margin-bottom:5px}
        .leg-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}

        .dm-bottom{display:grid;grid-template-columns:1fr 1fr;gap:10px}

        .act-bars{display:flex;align-items:flex-end;gap:5px;height:90px;padding-top:6px}
        .act-day{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%}
        .act-bw{flex:1;width:100%;display:flex;flex-direction:column;justify-content:flex-end;gap:2px}
        .act-bar{width:100%;border-radius:2px;animation:barGrow .6s ease-out both;transform-origin:bottom}
        .act-bar.h{background:#4f46e5}.act-bar.m{background:#818cf8}.act-bar.l{background:#c7d2fe}
        .act-lbl{font-size:9px;color:var(--text-muted)}

        .wl-tbl{width:100%;font-size:11px}
        .wl-tbl thead th{font-size:10px;font-weight:600;color:var(--text-muted);text-align:left;padding:5px 0;border-bottom:1px solid var(--border)}
        .wl-tbl td{padding:7px 0;border-bottom:1px solid var(--border-light);vertical-align:middle}
        .mem{display:flex;align-items:center;gap:7px}
        .mem-av{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff}
        .mem-name{font-weight:600;font-size:11px}
        .mem-role{font-size:9px;color:var(--text-muted)}
        .lp-badge{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:500}
        .lp-badge.ok{background:#dcfce7;color:#166534}.lp-badge.warn{background:#fee2e2;color:#991b1b}
        .lp-badge.info{background:#dbeafe;color:#1e40af}.lp-badge.alert{background:#fef3c7;color:#92400e}
        .lp-badge::before{content:'';width:4px;height:4px;border-radius:50%;background:currentColor}

        .dm-foot{display:flex;gap:6px;margin-top:14px;padding:6px;background:#fff;border-radius:8px;border:1px solid var(--border-light)}
        .dm-tab{padding:5px 12px;font-size:11px;color:var(--text-secondary);border-radius:6px}
        .dm-tab.active{background:var(--accent);color:#fff;font-weight:600}

        .trusted{padding:56px 0 40px;text-align:center}
        .trusted-lbl{font-size:12px;font-weight:500;color:var(--text-muted);margin-bottom:20px;letter-spacing:.04em}
        .trusted-row{display:flex;align-items:center;justify-content:center;gap:40px;flex-wrap:wrap;opacity:.45}
        .trusted-item{font-family:var(--font-en);font-size:17px;font-weight:700;color:var(--text-secondary)}

        .features{padding:80px 0}
        .feat-layout{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;margin-top:48px}
        .section-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;background:#fff;border:1px solid var(--border);border-radius:20px;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:16px}
        .section-title{font-size:clamp(26px,3.2vw,38px);font-weight:700;line-height:1.25;margin-bottom:14px;letter-spacing:-.01em}
        .section-title em{font-family:var(--font-serif);font-style:italic;font-weight:400;color:var(--indigo)}
        .section-sub{font-size:14px;color:var(--text-secondary);max-width:520px;line-height:1.75}

        .feat-cards{position:relative;height:420px}
        .feat-card{position:absolute;background:#fff;border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);padding:18px;border:1px solid var(--border-light);transition:transform .3s}
        .feat-card:nth-child(1){top:0;left:0;width:88%;z-index:3}
        .feat-card:nth-child(2){top:150px;right:0;width:82%;z-index:2}
        .feat-card:nth-child(3){bottom:0;left:16px;width:78%;z-index:1}
        .feat-card-icon{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;margin-bottom:8px}
        .feat-card-icon svg{width:17px;height:17px}
        .feat-card h4{font-size:13px;font-weight:700;margin-bottom:3px}
        .feat-card p{font-size:11px;color:var(--text-secondary);line-height:1.5}
        .feat-card .mini-ui{background:#f8fafc;border-radius:6px;padding:10px;margin-top:10px;border:1px solid var(--border-light)}
        .mini-bars{display:flex;gap:3px;align-items:flex-end;height:36px}
        .mini-bar{flex:1;border-radius:2px;background:var(--indigo);opacity:.7;animation:barGrow .8s ease-out both;transform-origin:bottom}
        .mini-table-row{display:flex;gap:6px;align-items:center;padding:3px 0;border-bottom:1px solid var(--border-light)}
        .mini-table-row:last-child{border:0}
        .mini-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
        .mini-label{font-size:9px;color:var(--text-secondary);flex:1}
        .mini-val{font-size:9px;font-weight:600;font-family:var(--font-en)}

        .why{padding:80px 0;text-align:center}
        .why-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:48px}
        .why-card{background:#fff;border-radius:var(--radius-lg);padding:28px 22px;border:1px solid var(--border-light);text-align:left;transition:all .3s}
        .why-card:hover{box-shadow:var(--shadow-md);transform:translateY(-4px)}
        .why-icon{width:42px;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center;margin-bottom:14px}
        .why-icon svg{width:20px;height:20px}
        .why-card h3{font-size:15px;font-weight:700;margin-bottom:6px}
        .why-card p{font-size:12.5px;color:var(--text-secondary);line-height:1.65}

        .faq{padding:80px 0}
        .faq-head{text-align:center;margin-bottom:48px}
        .faq-list{max-width:700px;margin:0 auto}
        .faq-item{border-bottom:1px solid var(--border)}
        .faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;padding:18px 0;font-size:14px;font-weight:600;text-align:left;transition:color .2s}
        .faq-q:hover{color:var(--indigo)}
        .faq-chev{width:18px;height:18px;flex-shrink:0;transition:transform .3s;color:var(--text-muted)}
        .faq-item.open .faq-chev{transform:rotate(180deg)}
        .faq-a{max-height:0;overflow:hidden;transition:max-height .3s ease}
        .faq-item.open .faq-a{max-height:200px}
        .faq-a p{padding-bottom:18px;font-size:13px;color:var(--text-secondary);line-height:1.7}

        .cta-section{padding:80px 0;text-align:center}
        .cta-box{background:linear-gradient(135deg,#1e1b4b,#312e81);border-radius:var(--radius-xl);padding:56px 40px;color:#fff;position:relative;overflow:hidden}
        .cta-box::before{content:'';position:absolute;top:-50%;right:-20%;width:400px;height:400px;background:radial-gradient(circle,rgba(99,102,241,.3),transparent 70%);pointer-events:none}
        .cta-box h2{font-size:clamp(24px,3vw,36px);font-weight:700;margin-bottom:12px}
        .cta-box h2 em{font-family:var(--font-serif);font-style:italic;font-weight:400}
        .cta-box p{font-size:15px;color:rgba(255,255,255,.7);margin-bottom:28px;max-width:480px;margin-left:auto;margin-right:auto}
        .cta-box .btn-cta{padding:14px 36px;background:#fff;color:var(--accent);border-radius:10px;font-size:14px;font-weight:700;transition:all .2s;display:inline-block}
        .cta-box .btn-cta:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.3)}

        .footer{padding:40px 0;border-top:1px solid var(--border);text-align:center}
        .footer-inner{display:flex;align-items:center;justify-content:space-between}
        .footer-logo{display:flex;align-items:center;gap:8px;font-family:var(--font-en);font-weight:700;font-size:16px}
        .footer-links{display:flex;gap:24px}
        .footer-links a{font-size:12px;color:var(--text-secondary);transition:color .2s}
        .footer-links a:hover{color:var(--text-primary)}
        .footer-copy{font-size:12px;color:var(--text-muted)}

        @media(max-width:900px){
          .ds{display:none}.pricing-grid,.why-grid{grid-template-columns:1fr 1fr}
          .feat-layout{grid-template-columns:1fr}.feat-cards{height:340px}
        }
        @media(max-width:640px){
          .nav-links{display:none}.pricing-grid,.why-grid{grid-template-columns:1fr}
          .dm-stats{grid-template-columns:repeat(2,1fr)}.dm-charts,.dm-bottom{grid-template-columns:1fr}
          .footer-inner{flex-direction:column;gap:14px}.trusted-row{gap:20px}
        }
      `}</style>

      <div className="landing-root">
      {/* NAV */}
      <nav className={`nav${scrolled ? " scrolled" : ""}`}>
        <div className="nav-inner">
          <a href="#" className="nav-logo">
            <div className="nav-logo-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            CF1
          </a>
          <div className="nav-links">
            <a href="#" className="active">홈 <span className="en">Home</span></a>
            <a href="#features">주요기능 <span className="en">Features</span></a>
            <a href="#why">도입효과 <span className="en">Benefits</span></a>
            <a href="#faq">자주 묻는 질문 <span className="en">FAQ</span></a>
          </div>
          <button className="nav-login" onClick={() => router.push("/login")}>로그인 Login</button>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="container">
          <div className="hero-badge anim-up"><span></span> 금융 여신심사 전문 플랫폼</div>
          <h1 className="hero-title anim-up anim-d1">
            여신심사를 더 빠르고 정확하게,<br/><em>Credit Flow One</em>
          </h1>
          <p className="hero-sub anim-up anim-d2">
            DART 전자공시 연동, AI 재무분석, 감정평가서 자동추출까지<br/>
            여신심사에 필요한 모든 것을 하나의 플랫폼에서 제공합니다.
          </p>
          <div className="hero-actions anim-up anim-d3">
            <button className="btn-primary" onClick={() => router.push("/login")}>시스템 접속하기</button>
          </div>

          {/* DASHBOARD MOCKUP */}
          <div className="dash-wrap">
            <div className="dash">
              {/* Sidebar */}
              <aside className="ds">
                <div className="ds-logo">
                  <i>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                      <path d="M2 17l10 5 10-5"/>
                      <path d="M2 12l10 5 10-5"/>
                    </svg>
                  </i>
                  CF1
                </div>

                <div className="ds-label">메뉴 Menu</div>
                <div className="ds-item active">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7"/>
                    <rect x="14" y="3" width="7" height="7"/>
                    <rect x="3" y="14" width="7" height="7"/>
                    <rect x="14" y="14" width="7" height="7"/>
                  </svg>
                  <span className="ko">대시보드</span><span className="en">Dashboard</span>
                </div>
                <div className="ds-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="20" x2="18" y2="10"/>
                    <line x1="12" y1="20" x2="12" y2="4"/>
                    <line x1="6" y1="20" x2="6" y2="14"/>
                  </svg>
                  <span className="ko">기업 재무현황</span>
                </div>
                <div className="ds-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    <line x1="11" y1="8" x2="11" y2="14"/>
                    <line x1="8" y1="11" x2="14" y2="11"/>
                  </svg>
                  <span className="ko">감정평가서 분석</span>
                </div>
                <div className="ds-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span className="ko">파일 관리</span><span className="en">Files</span>
                </div>
                <div className="ds-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span className="ko">피드백</span><span className="en">Feedback</span>
                </div>

                <div className="ds-label">관리 Admin</div>
                <div className="ds-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                  </svg>
                  <span className="ko">설정</span><span className="en">Settings</span>
                </div>
                <div className="ds-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  <span className="ko">사용자 관리</span>
                </div>

                <div className="ds-cta">
                  <h4>일일 조회 현황</h4>
                  <p>오늘 7 / 10건 사용<br/>잔여 3건</p>
                  <div style={{height:"4px",background:"#e0e7ff",borderRadius:"2px",overflow:"hidden"}}>
                    <div style={{width:"70%",height:"100%",background:"#4338ca",borderRadius:"2px"}}></div>
                  </div>
                </div>
              </aside>

              {/* Main */}
              <div className="dm">
                <div className="dm-head">
                  <div>
                    <h2>안녕하세요, 여신전문가님! 👋</h2>
                    <p>오늘의 여신심사 현황을 확인하세요</p>
                  </div>
                  <div className="dm-head-r">
                    <div className="dm-search">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      기업명 검색...
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                      <div className="dm-avatar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:"16px",height:"16px"}}>
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                      </div>
                      <div className="dm-user">
                        <span>여신전문가</span>
                        <small>여신전문가 · 기업금융본부</small>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="dm-stats">
                  <div className="st">
                    <div className="st-val">247</div>
                    <div className="st-lbl">총 조회 건수 Total Queries</div>
                  </div>
                  <div className="st">
                    <div className="st-val">38</div>
                    <div className="st-lbl">이번 주 조회 Weekly</div>
                  </div>
                  <div className="st">
                    <div className="st-val">156</div>
                    <div className="st-lbl">생성 파일 수 Files</div>
                  </div>
                  <div className="st">
                    <div className="st-val">12</div>
                    <div className="st-lbl">다운로드 수 Downloads</div>
                  </div>
                </div>

                {/* Charts */}
                <div className="dm-charts">
                  {/* 재무비율 분석 */}
                  <div className="cc">
                    <div className="cc-head">
                      <div>
                        <div className="cc-title">재무비율 분석 Financial Ratios</div>
                        <div className="cc-sub">삼성전자 · 2025.12 기준</div>
                      </div>
                      <div className="cc-dots"><span></span><span></span><span></span></div>
                    </div>
                    <div className="ratio-grid">
                      <div className="ratio-item">
                        <div className="ratio-val good">142.3%</div>
                        <div className="ratio-lbl">부채비율 Debt Ratio</div>
                      </div>
                      <div className="ratio-item">
                        <div className="ratio-val good">187.5%</div>
                        <div className="ratio-lbl">유동비율 Current Ratio</div>
                      </div>
                      <div className="ratio-item">
                        <div className="ratio-val good">8.7%</div>
                        <div className="ratio-lbl">ROA 총자산이익률</div>
                      </div>
                      <div className="ratio-item">
                        <div className="ratio-val warn">3.2x</div>
                        <div className="ratio-lbl">이자보상배율 ICR</div>
                      </div>
                    </div>
                  </div>

                  {/* 담보 분석 */}
                  <div className="cc">
                    <div className="cc-head">
                      <div>
                        <div className="cc-title">담보 유형 분석 Collateral</div>
                        <div className="cc-sub">이번 달 감정평가 현황</div>
                      </div>
                      <div className="cc-dots"><span></span><span></span><span></span></div>
                    </div>
                    <div className="donut-wrap">
                      <svg className="donut-svg" viewBox="0 0 42 42">
                        <circle cx="21" cy="21" r="16" fill="none" stroke="#e2e8f0" strokeWidth="5"/>
                        <circle cx="21" cy="21" r="16" fill="none" stroke="#4f46e5" strokeWidth="5" strokeDasharray="45 55" strokeDashoffset="25" strokeLinecap="round"/>
                        <circle cx="21" cy="21" r="16" fill="none" stroke="#3b82f6" strokeWidth="5" strokeDasharray="28 72" strokeDashoffset="80" strokeLinecap="round"/>
                        <circle cx="21" cy="21" r="16" fill="none" stroke="#93c5fd" strokeWidth="5" strokeDasharray="15 85" strokeDashoffset="52" strokeLinecap="round"/>
                      </svg>
                      <div className="donut-leg">
                        <div className="donut-leg-item"><span className="leg-dot" style={{background:"#4f46e5"}}></span>아파트 APT: 45건</div>
                        <div className="donut-leg-item"><span className="leg-dot" style={{background:"#3b82f6"}}></span>상가 Commercial: 28건</div>
                        <div className="donut-leg-item"><span className="leg-dot" style={{background:"#93c5fd"}}></span>토지 Land: 15건</div>
                        <div className="donut-leg-item"><span className="leg-dot" style={{background:"#e2e8f0"}}></span>기타 Others: 12건</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Row */}
                <div className="dm-bottom">
                  {/* 주간 조회 추이 */}
                  <div className="cc">
                    <div className="cc-head">
                      <div>
                        <div className="cc-title">주간 조회 추이 Weekly Trend</div>
                        <div className="cc-sub">전주 대비 +12% 증가</div>
                      </div>
                      <div className="cc-dots"><span></span><span></span><span></span></div>
                    </div>
                    <div style={{display:"flex",alignItems:"baseline",gap:"6px",marginBottom:"10px"}}>
                      <span style={{fontSize:"22px",fontWeight:700,fontFamily:"var(--font-en)"}}>38건</span>
                      <span style={{fontSize:"10px",color:"var(--green)"}}>▲ 12%</span>
                    </div>
                    <div className="act-bars">
                      <div className="act-day">
                        <div className="act-bw">
                          <div className="act-bar h" style={{height:"30%"}}></div>
                          <div className="act-bar m" style={{height:"15%"}}></div>
                        </div>
                        <span className="act-lbl">월</span>
                      </div>
                      <div className="act-day">
                        <div className="act-bw">
                          <div className="act-bar h" style={{height:"55%"}}></div>
                          <div className="act-bar m" style={{height:"20%"}}></div>
                        </div>
                        <span className="act-lbl">화</span>
                      </div>
                      <div className="act-day">
                        <div className="act-bw">
                          <div className="act-bar h" style={{height:"75%"}}></div>
                          <div className="act-bar m" style={{height:"10%"}}></div>
                        </div>
                        <span className="act-lbl">수</span>
                      </div>
                      <div className="act-day">
                        <div className="act-bw">
                          <div className="act-bar h" style={{height:"45%"}}></div>
                          <div className="act-bar m" style={{height:"25%"}}></div>
                        </div>
                        <span className="act-lbl">목</span>
                      </div>
                      <div className="act-day">
                        <div className="act-bw">
                          <div className="act-bar h" style={{height:"60%"}}></div>
                          <div className="act-bar m" style={{height:"15%"}}></div>
                        </div>
                        <span className="act-lbl">금</span>
                      </div>
                    </div>
                  </div>

                  {/* 최근 조회 내역 */}
                  <div className="cc">
                    <div className="cc-head">
                      <div className="cc-title">최근 조회 내역 Recent</div>
                      <a href="#" style={{fontSize:"11px",color:"var(--indigo)",fontWeight:600}}>전체보기</a>
                    </div>
                    <table className="wl-tbl">
                      <thead>
                        <tr>
                          <th>기업명</th>
                          <th>유형</th>
                          <th>상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>
                            <div className="mem">
                              <div className="mem-av" style={{background:"#4f46e5"}}>삼</div>
                              <div>
                                <div className="mem-name">삼성전자</div>
                                <div className="mem-role">DART 재무조회</div>
                              </div>
                            </div>
                          </td>
                          <td style={{fontSize:"10px"}}>재무분석</td>
                          <td><span className="lp-badge ok">완료</span></td>
                        </tr>
                        <tr>
                          <td>
                            <div className="mem">
                              <div className="mem-av" style={{background:"#3b82f6"}}>현</div>
                              <div>
                                <div className="mem-name">현대건설</div>
                                <div className="mem-role">감사보고서</div>
                              </div>
                            </div>
                          </td>
                          <td style={{fontSize:"10px"}}>재무분석</td>
                          <td><span className="lp-badge ok">완료</span></td>
                        </tr>
                        <tr>
                          <td>
                            <div className="mem">
                              <div className="mem-av" style={{background:"var(--green)"}}>강</div>
                              <div>
                                <div className="mem-name">강남구 아파트</div>
                                <div className="mem-role">감정평가서</div>
                              </div>
                            </div>
                          </td>
                          <td style={{fontSize:"10px"}}>감정평가</td>
                          <td><span className="lp-badge info">분석중</span></td>
                        </tr>
                        <tr>
                          <td>
                            <div className="mem">
                              <div className="mem-av" style={{background:"var(--orange)"}}>L</div>
                              <div>
                                <div className="mem-name">LG화학</div>
                                <div className="mem-role">분기보고서</div>
                              </div>
                            </div>
                          </td>
                          <td style={{fontSize:"10px"}}>재무분석</td>
                          <td><span className="lp-badge ok">완료</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Dash Footer */}
                <div className="dm-foot">
                  <div className="dm-tab active">대시보드</div>
                  <div className="dm-tab">기업 재무현황</div>
                  <div className="dm-tab">감정평가서</div>
                  <div className="dm-tab">파일 관리</div>
                  <div className="dm-tab">피드백</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUSTED */}
      <section className="trusted">
        <div className="container">
          <div className="trusted-lbl">데이터 연동 Data Partners</div>
          <div className="trusted-row">
            <span className="trusted-item">DART 전자공시</span>
            <span className="trusted-item">국토교통부</span>
            <span className="trusted-item">한국부동산원</span>
            <span className="trusted-item">NICE 신용평가</span>
            <span className="trusted-item">인포케어</span>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features" id="features">
        <div className="container">
          <div className="feat-layout">
            <div>
              <div className="section-badge">✦ 핵심 기능 Core Features</div>
              <h2 className="section-title">
                여신심사에 필요한 모든 것,<br/><em>One Platform</em>에서
              </h2>
              <p className="section-sub">
                DART 전자공시 자동 연동부터 감정평가서 PDF 파싱, AI 재무진단, Excel 보고서 생성까지 — 심사역의 업무 흐름에 맞춘 통합 솔루션입니다.
              </p>
            </div>
            <div>
              <div className="feat-cards">
                {/* Card 1: 기업 재무분석 */}
                <div className="feat-card">
                  <div className="feat-card-icon" style={{background:"#dbeafe"}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                      <line x1="18" y1="20" x2="18" y2="10"/>
                      <line x1="12" y1="20" x2="12" y2="4"/>
                      <line x1="6" y1="20" x2="6" y2="14"/>
                    </svg>
                  </div>
                  <h4>기업 재무현황 Financial Analysis</h4>
                  <p>DART 연동으로 재무제표 자동 조회, BS/IS 분석, 재무비율 산출, AI 재무진단까지 원클릭</p>
                  <div className="mini-ui">
                    <div className="mini-bars">
                      <div className="mini-bar" style={{height:"60%"}}></div>
                      <div className="mini-bar" style={{height:"85%"}}></div>
                      <div className="mini-bar" style={{height:"45%"}}></div>
                      <div className="mini-bar" style={{height:"70%"}}></div>
                      <div className="mini-bar" style={{height:"90%"}}></div>
                    </div>
                  </div>
                </div>
                {/* Card 2: 감정평가서 */}
                <div className="feat-card">
                  <div className="feat-card-icon" style={{background:"#dcfce7"}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      <line x1="11" y1="8" x2="11" y2="14"/>
                      <line x1="8" y1="11" x2="14" y2="11"/>
                    </svg>
                  </div>
                  <h4>감정평가서 분석 Appraisal</h4>
                  <p>PDF 업로드만으로 담보분석, 비준사례, 시장환경 자동 추출 및 Excel 생성</p>
                </div>
                {/* Card 3: Excel 보고서 */}
                <div className="feat-card">
                  <div className="feat-card-icon" style={{background:"#fef3c7"}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                  </div>
                  <h4>Excel 보고서 자동생성 Report</h4>
                  <p>분석 결과를 은행 심사서식에 맞춘 Excel로 즉시 다운로드</p>
                  <div className="mini-ui">
                    <div className="mini-table-row">
                      <div className="mini-dot" style={{background:"var(--green)"}}></div>
                      <div className="mini-label">재무상태표 BS</div>
                      <div className="mini-val">5개년</div>
                    </div>
                    <div className="mini-table-row">
                      <div className="mini-dot" style={{background:"var(--blue)"}}></div>
                      <div className="mini-label">손익계산서 IS</div>
                      <div className="mini-val">5개년</div>
                    </div>
                    <div className="mini-table-row">
                      <div className="mini-dot" style={{background:"var(--orange)"}}></div>
                      <div className="mini-label">재무비율 Ratios</div>
                      <div className="mini-val">자동산출</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY */}
      <section className="why" id="why">
        <div className="container">
          <div className="section-badge" style={{margin:"0 auto 16px"}}>✦ 도입 효과 Benefits</div>
          <h2 className="section-title">왜 <em>CF1</em>을 선택해야 할까요?</h2>
          <div className="why-grid">
            <div className="why-card">
              <div className="why-icon" style={{background:"#dbeafe"}}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </div>
              <h3>심사 시간 80% 단축 Faster</h3>
              <p>기업명 입력 한 번으로 DART 재무제표 자동 조회, 재무비율 산출, AI 진단까지 완료됩니다. 수작업 엑셀 정리가 필요 없습니다.</p>
            </div>
            <div className="why-card">
              <div className="why-icon" style={{background:"#dcfce7"}}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <h3>데이터 정확성 보장 Accurate</h3>
              <p>DART 공시데이터 직접 연동으로 수기 입력 오류를 원천 차단합니다. 감사보고서 XML 파싱으로 원본 데이터 그대로 반영합니다.</p>
            </div>
            <div className="why-card">
              <div className="why-icon" style={{background:"#fef3c7"}}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <h3>감정평가서 자동분석 Smart</h3>
              <p>감정평가서 PDF를 업로드하면 담보분석, 공급개요, 비준사례, 시장환경 데이터를 AI가 자동 추출하여 엑셀로 정리합니다.</p>
            </div>
            <div className="why-card">
              <div className="why-icon" style={{background:"#e0e7ff"}}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                  <line x1="9" y1="21" x2="9" y2="9"/>
                </svg>
              </div>
              <h3>은행 서식 Excel 생성 Export</h3>
              <p>분석 결과를 은행 여신심사 서식에 맞춘 Excel 파일로 즉시 다운로드합니다. BS, IS, 재무비율, 차입금 현황까지 한 번에.</p>
            </div>
            <div className="why-card">
              <div className="why-icon" style={{background:"#fee2e2"}}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h3>안전한 데이터 관리 Secure</h3>
              <p>사용자별 접근 권한 관리, 조회 이력 로깅, 관리자 대시보드를 통해 데이터 보안과 감사 추적이 가능합니다.</p>
            </div>
            <div className="why-card">
              <div className="why-icon" style={{background:"#f3e8ff"}}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <h3>팀 협업 지원 Teamwork</h3>
              <p>팀원별 계정 관리, 피드백 시스템, 사용량 통계 대시보드로 여신심사팀 전체의 업무 효율을 높입니다.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq" id="faq">
        <div className="container">
          <div className="faq-head">
            <h2 className="section-title">자주 묻는 <em>질문</em> FAQ</h2>
          </div>
          <div className="faq-list">
            {faqItems.map((item, idx) => (
              <div key={idx} className={`faq-item${openFaq === idx ? " open" : ""}`}>
                <button className="faq-q" onClick={() => toggleFaq(idx)}>
                  {item.q}
                  <svg className="faq-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div className="faq-a"><p>{item.a}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="container">
          <div className="cta-box">
            <h2>여신심사의 새로운 기준,<br/><em>지금 시작하세요</em></h2>
            <p>기업 재무분석부터 감정평가서 분석까지,<br/>CF1으로 심사 업무를 혁신하세요.</p>
            <Link href="/login" className="btn-cta">시스템 접속하기 Login</Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="container">
          <div className="footer-inner">
            <div className="footer-logo">
              <div className="nav-logo-icon" style={{width:"28px",height:"28px",borderRadius:"7px"}}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:"14px",height:"14px",color:"#fff"}}>
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5"/>
                  <path d="M2 12l10 5 10-5"/>
                </svg>
              </div>
              CF1
            </div>
            <div className="footer-links">
              <a href="#">이용약관 Terms</a>
              <a href="#">개인정보처리방침 Privacy</a>
              <a href="#">고객센터 Support</a>
            </div>
            <div className="footer-copy">&copy; 2026 Credit Flow One. All rights reserved.</div>
          </div>
        </div>
      </footer>
      </div>{/* end landing-root */}
    </>
  );
}
