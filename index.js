
const express = require('express');
const axios = require('axios');
const app = express();

// Render tự động cấp port qua process.env.PORT, mặc định nếu chạy local là 10000
const PORT = process.env.PORT || 10000;

app.use(express.json());

// Cấu hình Header cho phép truy cập (CORS) từ mọi nguồn
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// Bộ nhớ đệm tạm thời lưu lịch sử phân tích đối chiếu Đúng/Sai
let predictionStorage = [];

/**
 * THUẬT TOÁN PHÂN TÍCH MA TRẬN SỐ NÂNG CAO (KHÔNG NGẪU NHIÊN)
 */
function advancedLotteryEngine(historyList) {
    if (!historyList || historyList.length < 5) return null;

    const latestResult = historyList[0];
    const latestNumbers = latestResult.lotteryNum.split(',').map(n => parseInt(n.trim()));
    const totalPositions = latestNumbers.length;

    let frequencyMap = {};
    let positionFrequency = Array.from({ length: totalPositions }, () => ({}));

    historyList.forEach((period) => {
        if (!period.lotteryNum) return;
        let nums = period.lotteryNum.split(',').map(n => n.trim());
        
        nums.forEach((num, index) => {
            frequencyMap[num] = (frequencyMap[num] || 0) + 1;
            if (index < totalPositions) {
                positionFrequency[index][num] = (positionFrequency[index][num] || 0) + 1;
            }
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
        if (calculatedDelta < 0) {
            basePrediction -= fiboModifiers[modifierIndex];
        } else {
            basePrediction += fiboModifiers[modifierIndex];
        }

        let finalNum = basePrediction % 10;
        if (finalNum < 0) finalNum += 10;
        
        predictedNumbers.push(finalNum.toString().padStart(2, '0'));
    }

    let totalPredictedSum = predictedNumbers.reduce((acc, curr) => acc + parseInt(curr), 0);
    let threshold = (totalPositions * 9) / 2;
    let taiXiuPrediction = totalPredictedSum >= threshold ? "Tài" : "Xỉu";
    let chanLePrediction = totalPredictedSum % 2 === 0 ? "Chẵn" : "Lẻ";

    let varianceSum = 0;
    latestNumbers.forEach(n => {
        varianceSum += Math.pow(n - (totalPredictedSum / totalPositions), 2);
    });
    let standardDeviation = Math.sqrt(varianceSum / totalPositions);
    let confidenceRate = Math.min(95, Math.max(60, Math.round(100 - (standardDeviation * 10))));

    return {
        next_period: (parseInt(latestResult.issueNum) + 1).toString(),
        numbers: predictedNumbers.join(','),
        total_sum: totalPredictedSum,
        tai_xiu: taiXiuPrediction,
        chan_le: chanLePrediction,
        algorithm_metrics: {
            confidence: `${confidenceRate}%`,
            hot_numbers_pool: hotNumbers.slice(0, 4),
            cold_numbers_pool: coldNumbers.slice(0, 4),
            calculated_threshold: threshold
        }
    };
}

// HÀM ĐỐI CHIẾU KẾT QUẢ THỰC TẾ & XỬ LÝ LỆNH TRẠNG THÁI WIN/LOSS
function processSystemAuditing(historyList) {
    if (!historyList || historyList.length === 0) return;

    predictionStorage.forEach(auditTarget => {
        if (auditTarget.status !== "Chờ kết quả") return;

        const actualRecord = historyList.find(historyItem => historyItem.issueNum === auditTarget.period);

        if (actualRecord) {
            auditTarget.real_result = actualRecord.lotteryNum;
            
            let actualNumbers = actualRecord.lotteryNum.split(',').map(n => parseInt(n.trim()));
            let actualSum = actualNumbers.reduce((acc, curr) => acc + curr, 0);
            let actualThreshold = (actualNumbers.length * 9) / 2;
            
            let actualTaiXiu = actualSum >= actualThreshold ? "Tài" : "Xỉu";
            let actualChanLe = actualSum % 2 === 0 ? "Chẵn" : "Lẻ";

            auditTarget.is_tai_xiu_correct = (auditTarget.predict_tai_xiu === actualTaiXiu);
            auditTarget.is_chan_le_correct = (auditTarget.predict_chan_le === actualChanLe);
            
            if (auditTarget.is_tai_xiu_correct && auditTarget.is_chan_le_correct) {
                auditTarget.status = "WIN HOÀN TOÀN";
            } else if (auditTarget.is_tai_xiu_correct || auditTarget.is_chan_le_correct) {
                auditTarget.status = "WIN 1 VẾ";
            } else {
                auditTarget.status = "LOSS";
            }
        }
    });
}

// ---------------- ROOT ENDPOINT (Giúp Render Health Check thành công, chống lỗi Timed Out) ----------------
app.get('/', (req, res) => {
    res.status(200).send("[HOANGDZ CORE] API Server is running online perfectly.");
});

// ---------------- ENDPOINT 1: PHÂN TÍCH CHÍNH & TẠO KỲ DỰ ĐOÁN MỚI ----------------
app.get('/api/analysis', async (req, res) => {
    try {
        const response = await axios.get('https://www.vnsodo.club/api/front/lottery/lastlottery?gameId=173', {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
            },
            timeout: 10000 // Giới hạn 10s tránh treo kết nối từ API gốc
        });
        
        const historyList = response.data?.data?.historyList;
        if (!historyList || historyList.length === 0) {
            return res.status(404).json({ status: "error", message: "Không thể trích xuất dữ liệu mảng lịch sử từ nguồn." });
        }

        processSystemAuditing(historyList);

        const systemEngineOutput = advancedLotteryEngine(historyList);
        const currentLiveResult = historyList[0];

        if (!predictionStorage.some(item => item.period === systemEngineOutput.next_period)) {
            predictionStorage.unshift({
                period: systemEngineOutput.next_period,
                predict_numbers: systemEngineOutput.numbers,
                predict_tai_xiu: systemEngineOutput.tai_xiu,
                predict_chan_le: systemEngineOutput.chan_le,
                real_result: "Đang chờ đồng bộ kết quả từ API nhà cái...",
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
            engine_signature: "HOANGDZ_NEURAL_LOGIC_V2",
            execution_time: new Date().toISOString(),
            current_live_data: {
                period: currentLiveResult.issueNum,
                result: currentLiveResult.lotteryNum,
                open_time: currentLiveResult.openTime
            },
            predict_matrix: systemEngineOutput
        });

    } catch (error) {
        res.status(500).json({ status: "error", code: 500, trace: error.message });
    }
});

// ---------------- ENDPOINT 2: LINK XEM ĐÚNG SAI / LỊCH SỬ ĐỐI CHIẾU KẾT QUẢ ----------------
app.get('/api/history', (req, res) => {
    res.json({
        status: "success",
        total_records_cached: predictionStorage.length,
        audit_log: predictionStorage
    });
});

// ---------------- ENDPOINT 3: THỐNG KÊ HIỆU SUẤT THẮNG/THUA CHÍNH XÁC ----------------
app.get('/api/accuracy', (req, res) => {
    const closedSessions = predictionStorage.filter(item => item.status !== "Chờ kết quả");
    if (closedSessions.length === 0) {
        return res.json({ status: "pending", message: "Đang thu thập mẫu dữ liệu phân tích đúng sai, vui lòng quay lại ở các kỳ tiếp theo." });
    }

    const totalSessions = closedSessions.length;
    const winTaiXiuCount = closedSessions.filter(item => item.is_tai_xiu_correct === true).length;
    const winChanLeCount = closedSessions.filter(item => item.is_chan_le_correct === true).length;
    const perfectWinCount = closedSessions.filter(item => item.status === "WIN HOÀN TOÀN").length;

    res.json({
        status: "success",
        performance_metrics: {
            total_evaluated_periods: totalSessions,
            perfect_win_rate: `${((perfectWinCount / totalSessions) * 100).toFixed(2)}%`,
            tai_xiu_accuracy_rate: `${((winTaiXiuCount / totalSessions) * 100).toFixed(2)}%`,
            chan_le_accuracy_rate: `${((winChanLeCount / totalSessions) * 100).toFixed(2)}%`
        }
    });
});

// Cấu hình bắt buộc để nhận mọi IP kết nối từ môi trường Cloud của Render
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[HOANGDZ CORE] API Server running stability on port: ${PORT}`);
});
