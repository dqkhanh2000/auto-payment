var isSentData = false;
var modelIsLoaded = false;
var intervalID;
$(document).ready(function () {
    const video = document.getElementById("video");
    video.width = 320;
    video.height = 240;

    loadModel().then(() =>{
        runCamera(video);
    })

    $('#btn-send').click(function(e){
        e.preventDefault();
        let form = $('form').get(0);
        if(!form.checkValidity()){
            form.classList.add("was-validated");
        }
        else{
            if(images.length>0){
                let data = {
                    name: $('#name').val(),
                    password: $('#password').val(),
                    balance: $('#balance').val,
                    images: images
                }
                sendData(data, 'http://0.0.0.0:8000/create-customer');
            }
            else{
                swal('Lỗi!', 'Chưa có dữ liệu khuôn mặt, vui lòng quét trước!', 'error');
            }
        }
    });
    
    $('#money').val(getFirstIndexOfRegex(/\?v=(\d+)/gm, document.URL));
});
var url = getFirstIndexOfRegex(/(http:\/\/[\d|.|\w]+:8000\/)/gm, document.URL);
var images = [];

async function sendData(data, url) {
    let result;
    await $.ajax({
        processData: false,
        contentType: false,
        url: url,
        headers: {
            'Content-Type': 'application/json'
        },
        method: 'POST',
        data: JSON.stringify(data),
        success: function(data){
           result = data;
        }
    });
    return new Promise((resolve, reject)=>{
        resolve(result);
    })
}

function loadModel() {
    Swal.fire('Đang tải dữ liệu, vui lòng chờ!');
    Swal.showLoading();
    return Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri("/"),
        faceapi.nets.faceRecognitionNet.loadFromUri("/"),
        faceapi.nets.faceLandmark68Net.loadFromUri("/"),
    ]);
}

async function runCamera(video) {
    let stream = await navigator.mediaDevices.getUserMedia({ video: {} });
    video.srcObject = stream;
}

async function recog() {
    // while(Swal.isLoading()); 
    isSentData = false;
    const video = document.getElementById("video");
    // intervalID = setInterval(async() =>{
        var result = await faceapi.detectAllFaces(video, new faceapi.SsdMobilenetv1Options())
            .withFaceLandmarks()
            .withFaceDescriptors();
        if (result.length === 1)
            if (images.length < 5) {
                images.push(new faceapi.FaceMatcher(result));
                recog();
                if(!modelIsLoaded){
                    Swal.close();
                    modelIsLoaded = true;
                }
            } else {
                onRecogDone();
            }
        else recog();
    // }, 200);
}

async function capture() {
    const video = document.getElementById("video");
    const canvas = document.createElement('canvas');
    const displaySize = { width: video.width, height: video.height };
    intervalID = setInterval(async () =>{
        const detections = await faceapi.detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ match: 0.7 }))
        const resizedDetections = faceapi.resizeResults(detections, displaySize);

        if(resizedDetections.length === 1){
            let box = resizedDetections[0]._box;
            let ctx = canvas.getContext("2d");

            const canv = document.createElement('canvas');
            canv.width = video.width;
            canv.height = video.height;
            canv.getContext("2d").drawImage(video, 0, 0, canv.width, canv.height);
            let image = new Image();
            image.src = canv.toDataURL();

            image.onload = ()=>{
                canvas.width = box.width;
                canvas.height = box.height;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(image, box.x, box.y, box.width, box.height, 0, 0, canvas.width, canvas.height);
                images.push(canvas.toDataURL());
                if(images.length > 10){
                    onCaptureDone();
                }
            }; 
        }
    }, 500);
    
}

function onCaptureDone(){
    if (!isSentData){
        clearInterval(intervalID);
        isSentData = true;
        $('#card-body-camera').append('<div class="alert alert-success" role="alert">Quét dữ liệu khuôn mặt thành công!!</div>');
        $('#card-body-camera button').hide();
    }
}

function onRecogDone(){
    if (!isSentData){
        clearInterval(intervalID);
        isSentData = true;
        sendData(images, url+'transaction')
        .then(data => {
            if(data === "not found") {
                swal('Lỗi', 'Không tìm thấy dữ liệu, vui lòng quét lại', 'error').then(()=>{
                    images = [];
                    recog();
                });
            }
            else{
                stopStreamedVideo();
                let info = JSON.parse(data);
                $("#name").val(info[0].name);
                $("#account-number").val(info[0].id);
                setTimeout(() =>{
                    swal({
                        text: 'Mời bạn nhập mật khẩu để tiếp tục!',
                        content: {
                            element: "input",
                            attributes: {
                                placeholder: "Password",
                                type: "password",
                            },
                        },
                        button: {
                          text: "Tiếp tục",
                          closeModal: false,
                        },
                    })
                    .then(pass =>verifyPayment(pass));
                }, 500)
            }
        });     
    }
}

function getFirstIndexOfRegex(regex, str) {
    let m, result;

    while ((m = regex.exec(str)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        
        // The result can be accessed through the `m`-variable.
        m.forEach((match, groupIndex) => {
            if(groupIndex === 1) {
                result = match;
            }
        });
    }
    return result;
}

function stopStreamedVideo() {
    let video = document.getElementById("video");
    let stream = video.srcObject;
    let tracks = stream.getTracks();
  
    tracks.forEach(function(track) {
      track.stop();
    });
  
    video.srcObject = null;
}

function verifyPayment(password){
    let result = false;
    $.ajax({
        url: url+'verify-payment',
        method: 'POST',
        data: {
            id: $("#account-number").val(),
            transaction_id: getFirstIndexOfRegex(/\/([\d|\w]{32})/gm, document.URL),
            password: password
        },
        success: result => {
            if(result === 'success') swal('Thành công!', 'Giao dịch thành công!', 'success').then(e => window.close());
            else if(result === 'wrong password') {
                swal('Lỗi!', 'Sai mật khẩu!', 'error')
                .then( e => {
                    swal({
                        text: 'Mời bạn nhập mật khẩu để tiếp tục!',
                        content: {
                            element: "input",
                            attributes: {
                                placeholder: "Password",
                                type: "password",
                            },
                        },
                        button: {
                        text: "Tiếp tục",
                        closeModal: false,
                        },
                    })
                    .then(pass =>verifyPayment(pass))
                });
            }
            else if(result === 'not enough')
                swal('Lỗi!', 'Tài khoản không đủ!', 'error').then( e => window.close());
            else swal('Lỗi', 'Giao dịch thất bại do: '+ result, 'error').then(e => window.close())}
    })
    return result;
}