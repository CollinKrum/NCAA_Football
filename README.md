# 🏈 NCAAF Betting Analysis Dashboard

A comprehensive, professional-grade college football betting analysis tool featuring advanced analytics, sharp money detection, and expected value calculations.

## ✨ Features

### 📊 **Core Analytics**
- **18,000+ Games** analyzed across multiple seasons (2021-2025)
- **Interactive Charts** for spread and totals analysis with Chart.js
- **Conference Breakdowns** and historical performance trends
- **Real-time Filtering** by season, sportsbook, and conference
- **Mobile-Responsive** design optimized for all devices

### ⚡ **Professional Tools**
- **Sharp Money Detection** - Track line movement patterns
- **Expected Value Analysis** - Calculate EV for spreads and totals  
- **Key Numbers Analysis** - Identify critical margins (3, 7, 10, 14)
- **Team Performance Analyzer** - Deep dive into individual team metrics
- **Moneyline ROI Tracking** - Units-based profit/loss analysis

### 📈 **Advanced Features**
- **ATS Performance** tracking by conference and team
- **Over/Under Trends** with betting total vs actual scoring
- **Market Inefficiency** detection across sportsbooks
- **CSV Export** functionality for further analysis
- **Multi-sportsbook** coverage (DraftKings, FanDuel, BetMGM, Caesars)

## 🚀 Live Demo
[View Dashboard](https://collinkrum.github.io/NCAA_Football/)

## 🛠️ Technology Stack

- **Frontend**: Vanilla JavaScript, Chart.js, HTML5, CSS3
- **Backend**: Node.js, Express.js
- **Data Processing**: CSV parsing, JSON data handling
- **Styling**: Modern CSS with gradients, animations, and responsive design
- **Charts**: Chart.js for interactive data visualizations

## 📦 Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn package manager

### Quick Start
```bash
# Clone the repository
git clone https://github.com/collinkrum/NCAA_Football.git
cd NCAA_Football

# Install dependencies
npm install

# Start the development server
npm run dev

# Or start production server
npm start
```

### Data Setup
1. Place your NCAA football data in `data/ncaaf-games.json`
2. The app includes demo data generation if no data file is found
3. Supported data formats: JSON with game records including spreads, totals, scores, and moneylines

### Server Endpoints
```
GET /api/games       - Retrieve games data with optional filtering
GET /api/stats       - Get summary statistics and metadata  
GET /api/health      - Health check endpoint
GET /               - Main dashboard interface
```

## 📊 Data Structure

The application expects game data with the following structure:
```json
{
  "id": 1,
  "season": 2024,
  "week": 1,
  "startDate": "2024-09-01T19:00:00Z",
  "homeTeam": "Alabama",
  "awayTeam": "Georgia", 
  "homeConference": "SEC",
  "awayConference": "SEC",
  "homeScore": 28,
  "awayScore": 21,
  "spread": -7.5,
  "overUnder": 54.5,
  "openingSpread": -6.5,
  "openingOverUnder": 56.0,
  "homeMoneyline": -280,
  "awayMoneyline": 220,
  "lineProvider": "DraftKings"
}
```

## 🎯 Key Analytics Features

### Sharp Money Detection
- Tracks spread and total movement by conference
- Identifies significant line moves indicating professional action
- Highlights reverse line movement patterns

### Expected Value Analysis  
- Calculates theoretical edge on spreads and totals
- Conference-specific ATS performance metrics
- Home vs Away betting outcome analysis

### Key Numbers Analysis
- Margin frequency distribution
- Identification of critical numbers in college football
- Historical margin landing patterns

### Team Analyzer
- Individual team ATS records and trends
- Over/Under performance by team
- Moneyline ROI calculations with unit tracking
- Recent game results and performance summaries

## 📱 Browser Compatibility

- ✅ Chrome/Chromium (recommended)
- ✅ Firefox  
- ✅ Safari
- ✅ Edge
- 📱 Mobile browsers (iOS Safari, Chrome Mobile)

## 🔧 Configuration

### Environment Variables
```env
PORT=3000                                # Server port
NODE_ENV=development                     # Environment mode

# Supabase (provided automatically when using the Vercel extension)
SUPABASE_URL=...                         # or NEXT_PUBLIC_SUPABASE_URL
SUPABASE_ANON_KEY=...                    # or NEXT_PUBLIC_SUPABASE_ANON_KEY / service role key

# Upstash Redis (provided automatically when using the Vercel extension)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

When the Supabase credentials are supplied, game data is fetched directly from the configured tables
(`ncaaf_games` and `nfl_games`). If no rows are returned—or Supabase is not configured—the server falls
back to local JSON files and, ultimately, to generated demo data. Upstash Redis powers the shared cache
for API responses; if its credentials are absent, the server degrades gracefully to in-memory caching.

### Data File Locations
- JSON data: `data/ncaaf-games.json`
- Demo data: Auto-generated if no data file found
- Export location: Browser downloads folder

## 📈 Performance Optimizations

- **Upstash Redis caching** with automatic in-memory fallback (5-minute refresh)
- **Lazy loading** for large datasets  
- **Efficient filtering** algorithms for real-time updates
- **Chart reuse** to minimize memory usage
- **Responsive design** optimized for mobile performance

## 🚢 Deployment

### GitHub Pages (Frontend Only)
```bash
# Build and deploy to gh-pages
npm run build
git add dist/
git commit -m "Deploy to GitHub Pages"
git subtree push --prefix dist origin gh-pages
```

### Full Stack Deployment
- **Heroku**: `git push heroku main`
- **Vercel**: Connect repository for automatic deployments  
- **Railway**: `railway login && railway deploy`
- **VPS**: PM2 process manager recommended

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Collin Krum**
- GitHub: [@collinkrum](https://github.com/collinkrum)
- Project Link: [https://github.com/collinkrum/NCAA_Football](https://github.com/collinkrum/NCAA_Football)

## 🙏 Acknowledgments

- College football data providers
- Chart.js community for excellent charting library
- Express.js team for the robust server framework
- Sports betting analytics community for insights and feedback

---

*Built with ❤️ for the sports betting analytics community*
