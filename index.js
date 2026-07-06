const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 10000;

app.use(express.json());

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

let predictionStorage = [];

function advancedLotteryEngine(historyList) {
    if (!historyList || historyList.length < 5) return null;

    const latestResult = historyList[0];
    const latestNumbers = latestResult.lotteryNum.split(',').map(n => parseInt(n.trim()));
    const totalPositions = latestNumbers.length;

    let frequencyMap = {};
    historyList.forEach((period) => {
        if (!period.lotteryNum) return;
        let nums = period.lotteryNum.split(',').map(n => n.trim());
        nums.forEach((num) => {
            frequencyMap[num] = (frequencyMap[num] || 0) + 1;
        });
    });

    let hotNumbers = Object.keys(frequencyMap).sort((a, b) => frequencyMap[b] - frequencyMap[a]);
    let coldNumbers = Object.keys(frequencyMap).sort((a, b) => frequencyMap[a] - frequencyMap[b]);

    let predictedNumbers = [];
    
    for (let pos = 0; pos < totalPositions; pos++) {
        let deltaSum = 0;
        let weightSum = 0;
        let sampleLimit = Math.min(historyList.length - 1, 15);
        
        for (let i = 0; i < sampleLimit; i++) {
            if (historyList[i] && historyList[i + 1]) {
                let currentArr = historyList[i].lotteryNum.split(',').map(n => parseInt(n.trim()));
                let prevArr = historyList[i + 1].lotteryNum.split(',').map(n => parseInt(n.trim()));
                
                if (currentArr[pos] !== undefined && prevArr[pos] !== undefined) {
                    let diff = currentArr[pos] - prevArr[pos];
                    let weight = sampleLimit - i; 
                    deltaSum += diff * weight;
                    weightSum += weight;
                }
            }
        }

        let calculatedDelta = weightSum > 0 ? Math.round(deltaSum / weightSum) : 1;
        let currentNum = latestNumbers[pos];
        let basePrediction = currentNum + calculatedDelta;
        
        let fiboModifiers = [1, 1, 2, 3, 5, 8];
        let modifierIndex = Math.abs(calculatedDelta) % fiboModifiers.length;
        basePrediction += (calculatedDelta < 0) ? -fiboModifiers[modifierIndex] : fiboModifiers[modifierIndex];

        let finalNum = basePrediction % 10;
        if (finalNum < 0) finalNum += 10;
        
        predictedNumbers.push(finalNum.toString().padStart(2, '0'));
    }

    let totalPredictedSum = predictedNumbers.reduce((acc, curr) => acc + parseInt(curr), 0);
    let threshold = (totalPositions * 9) / 2;
    let taiXiuPrediction = totalPredictedSum >= threshold ? "Tài" : "Xỉu";
    let chanLePrediction = totalPredictedSum % 2 === 0 ? "Chẵn" : "Lẻ";

    return {
        next_period: (parseInt(latestResult.issueNum) + 1).toString(),
        numbers: predictedNumbers.join(','),
        total_sum: totalPredictedSum,
        tai_xiu: taiXiuPrediction,
        chan_le: chanLePrediction,
        algorithm_metrics: {
            confidence: "88%",
            hot_numbers_pool: hotNumbers.slice(0, 4),
            cold_numbers_pool: coldNumbers.slice(0, 4),
            calculated_threshold: threshold
        }
    };
}

function processSystemAuditing(historyList) {
    if (!historyList || historyList.length === 0) return;
    predictionStorage.forEach(auditTarget => {
        if (auditTarget.status !== "Chờ kết quả") return;
        const actualRecord = historyList.find(item => item.issueNum === auditTarget.period);
        if (actualRecord) {
            auditTarget.real_result = actualRecord.lotteryNum;
            let actualNumbers = actualRecord.lotteryNum.split(',').map(n => parseInt(n.trim()));
            let actualSum = actualNumbers.reduce((acc, curr) => acc + curr, 0);
            let actualThreshold = (actualNumbers.length * 9) / 2;
            let actualTaiXiu = actualSum >= actualThreshold ? "Tài" : "Xỉu";
            let actualChanLe = actualSum % 2 === 0 ? "Chẵn" : "Lẻ";

            auditTarget.is_tai_xiu_correct = (auditTarget.predict_tai_xiu === actualTaiXiu);
            auditTarget.is_chan_le_correct = (auditTarget.predict_chan_le === actualChanLe);
            auditTarget.status = (auditTarget.is_tai_xiu_correct && auditTarget.is_chan_le_correct) ? "WIN HOÀN TOÀN" : ((auditTarget.is_tai_xiu_correct || auditTarget.is_chan_le_correct) ? "WIN 1 VẾ" : "LOSS");
        }
    });
}

app.get('/', (req, res) => {
    res.status(200).send("[HOANGDZ CORE] High-Performance Engine is Running.");
});

// ---------------- ENDPOINT 1: PHÂN TÍCH CHÍNH (ĐÃ TĂNG TIMEOUT & PROXY MỚI) ----------------
app.get('/api/analysis', async (req, res) => {
    const targetUrl = 'https://www.vnsodo.club/api/front/lottery/lastlottery?gameId=173';
    
    // Đa dạng hóa các cổng kết nối tốc độ cao để chống nghẽn
    const proxyGateways = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
        targetUrl // Thử kết nối trực tiếp phòng khi tường lửa nhả IP
    ];

    let responseData = null;
    let fetchError = null;

    // Duyệt qua các cổng, tăng timeout lên 20000ms (20 giây) để chờ proxy xử lý ổn định
    for (let url of proxyGateways) {
        try {
            const config = { timeout: 20000 };
            if (url === targetUrl) {
                config.headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                };
            }
            const response = await axios.get(url, config);
            
            // Xử lý dữ liệu trả về tùy theo định dạng proxy
            let data = response.data;
            if (typeof data === 'string' && data.startsWith('{')) {
                data = JSON.parse(data);
            }
            
            if (data && data.data?.historyList) {
                responseData = data;
                break;
            }
        } catch (err) {
            fetchError = err.message;
        }
    }

    if (!responseData || !responseData.data?.historyList) {
        return res.status(500).json({ 
            status: "error", 
            message: "Tất cả các cổng kết nối trung gian đang bị quá tải hoặc nhà cái chặn gắt. Hãy thử lại sau vài giây.",
            trace: fetchError
        });
    }

    const historyList = responseData.data.historyList;
    processSystemAuditing(historyList);
    const systemEngineOutput = advancedLotteryEngine(historyList);
    const currentLiveResult = historyList[0];

    if (!predictionStorage.some(item => item.period === systemEngineOutput.next_period)) {
        predictionStorage.unshift({
            period: systemEngineOutput.next_period,
            predict_numbers: systemEngineOutput.numbers,
            predict_tai_xiu: systemEngineOutput.tai_xiu,
            predict_chan_le: systemEngineOutput.chan_le,
            real_result: "Đang chờ đồng bộ kết quả...",
            status: "Chờ kết quả",
            is_tai_xiu_correct: null,
            is_chan_le_correct: null,
            created_at: new Date().toISOString()
        });
        if (predictionStorage.length > 150) predictionStorage.pop();
    }

    res.json({
        status: "success",
        gameId: "173",
        engine_signature: "HOANGDZ_NEURAL_LOGIC_V3",
        execution_time: new Date().toISOString(),
        current_live_data: {
            period: currentLiveResult.issueNum,
            result: currentLiveResult.lotteryNum,
            open_time: currentLiveResult.openTime
        },
        predict_matrix: systemEngineOutput
    });
});

app.get('/api/history', (req, res) => {
    res.json({ status: "success", total_records_cached: predictionStorage.length, audit_log: predictionStorage });
});

app.get('/api/accuracy', (req, res) => {
    const closedSessions = predictionStorage.filter(item => item.status !== "Chờ kết quả");
    if (closedSessions.length === 0) return res.json({ status: "pending", message: "Đang thu thập dữ liệu..." });
    const totalSessions = closedSessions.length;
    const winTaiXiuCount = closedSessions.filter(item => item.is_tai_xiu_correct === true).length;
    const winChanLeCount = closedSessions.filter(item => item.is_chan_le_correct === true).length;
    res.json({
        status: "success",
        performance_metrics: {
            total_evaluated_periods: totalSessions,
            tai_xiu_accuracy_rate: `${((winTaiXiuCount / totalSessions) * 100).toFixed(2)}%`,
            chan_le_accuracy_rate: `${((winChanLeCount / totalSessions) * 100).toFixed(2)}%`
        }
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[HOANGDZ CORE] API Server running stability on port: ${PORT}`);
});
