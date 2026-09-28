// Post-Event Analysis and Reporting CLI for Risk Capital
const { pool } = require('../db');

async function generateReport(sessionId) {
  console.log('================================================================');
  console.log('📊 RISK CAPITAL POST-EVENT ANALYTICS & INSIGHTS REPORT');
  console.log('================================================================\n');

  try {
    // 1. Fetch Session Details
    let sessionQuery = `SELECT * FROM sessions ORDER BY ended_at DESC LIMIT 1`;
    let queryParams = [];
    if (sessionId) {
      sessionQuery = `SELECT * FROM sessions WHERE id = $1 OR room_code = $1 LIMIT 1`;
      queryParams = [sessionId];
    }

    const sessionRes = await pool.query(sessionQuery, queryParams);
    if (sessionRes.rows.length === 0) {
      console.log('⚠️ No completed sessions found in database.');
      await pool.end();
      return;
    }

    const session = sessionRes.rows[0];
    console.log(`🎮 SESSION OVERVIEW:`);
    console.log(`   • Session ID:    ${session.id}`);
    console.log(`   • Room Code:     ${session.room_code}`);
    console.log(`   • Total Rounds:  ${session.total_rounds}`);
    console.log(`   • Started At:    ${new Date(session.started_at).toLocaleString()}`);
    console.log(`   • Ended At:      ${new Date(session.ended_at).toLocaleString()}`);
    console.log(`   • Duration:      ${((new Date(session.ended_at) - new Date(session.started_at)) / 1000 / 60).toFixed(1)} minutes\n`);

    // 2. Player Financial Metrics & Average Net Worth
    const playerStatsRes = await pool.query(`
      SELECT 
        COUNT(*) as total_players,
        AVG(final_net_worth) as avg_net_worth,
        MIN(final_net_worth) as min_net_worth,
        MAX(final_net_worth) as max_net_worth,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY final_net_worth) as median_net_worth,
        AVG(final_risk_score) as avg_risk_score
      FROM players
      WHERE session_id = $1
    `, [session.id]);

    const stats = playerStatsRes.rows[0];
    console.log(`💰 FINANCIAL PERFORMANCE (${stats.total_players} Participants):`);
    console.log(`   • Average Final Net Worth:  $${Number(stats.avg_net_worth || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`   • Median Final Net Worth:   $${Number(stats.median_net_worth || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`   • Highest Balance:          $${Number(stats.max_net_worth || 0).toLocaleString('en-US')}`);
    console.log(`   • Lowest Balance:           $${Number(stats.min_net_worth || 0).toLocaleString('en-US')}`);
    console.log(`   • Average Risk Score:       ${Number(stats.avg_risk_score || 0).toFixed(1)} pts\n`);

    // 3. Outcome Tier & Title Distribution
    const titleDistRes = await pool.query(`
      SELECT 
        final_title,
        COUNT(*) as count,
        ROUND((COUNT(*) * 100.0 / SUM(COUNT(*)) OVER ()), 1) as percentage,
        AVG(final_net_worth) as avg_cash
      FROM players
      WHERE session_id = $1
      GROUP BY final_title
      ORDER BY count DESC
    `, [session.id]);

    console.log(`🏷️ OUTCOME TIER & TITLE DISTRIBUTION:`);
    titleDistRes.rows.forEach(row => {
      console.log(`   • ${row.final_title.padEnd(24)}: ${String(row.count).padStart(3)} traders (${row.percentage}%) | Avg: $${Number(row.avg_cash).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
    });
    console.log('');

    // 4. Sector Popularity Breakdown
    const sectorStatsRes = await pool.query(`
      SELECT 
        d.sector_id,
        COUNT(*) as decision_count,
        ROUND((COUNT(*) * 100.0 / SUM(COUNT(*)) OVER ()), 1) as pick_percentage,
        SUM(d.amount_invested) as total_capital_allocated,
        SUM(d.outcome_amount) as total_profit_loss
      FROM decisions d
      JOIN players p ON d.player_uuid = p.player_uuid
      WHERE p.session_id = $1
      GROUP BY d.sector_id
      ORDER BY decision_count DESC
    `, [session.id]);

    console.log(`📈 SECTOR POPULARITY & CAPITAL FLOW:`);
    if (sectorStatsRes.rows.length > 0) {
      const mostPopular = sectorStatsRes.rows[0];
      const leastPopular = sectorStatsRes.rows[sectorStatsRes.rows.length - 1];

      sectorStatsRes.rows.forEach(row => {
        const pnl = Number(row.total_profit_loss);
        const pnlSign = pnl >= 0 ? '+' : '-';
        console.log(`   • ${row.sector_id.padEnd(16)}: ${String(row.decision_count).padStart(4)} votes (${row.pick_percentage}%) | Total PnL: ${pnlSign}$${Math.abs(pnl).toLocaleString('en-US')}`);
      });

      console.log(`\n   ⭐ Most Popular Sector:  ${mostPopular.sector_id} (${mostPopular.pick_percentage}% of all decisions)`);
      console.log(`   🔻 Least Popular Sector: ${leastPopular.sector_id} (${leastPopular.pick_percentage}% of all decisions)`);
    } else {
      console.log('   (No decision history recorded for this session)');
    }

    console.log('\n================================================================\n');
  } catch (err) {
    console.error('❌ Error generating analytics report:', err.message);
  } finally {
    await pool.end();
  }
}

const targetSession = process.argv[2] || null;
generateReport(targetSession);
