await fetch("https://taxinformation.cbic.gov.in/api/cbic-search", {
    "headers": {
        "accept": "application/json, text/plain, */*",
        "accept-language": "en-GB,en;q=0.9",
        "authorization1": "homeToken eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIxMC4yLjEwOC45IiwiYXV0aCI6IlJPTEVfQU5PTllNT1VTIiwiZXhwIjoxNzU4MDg1MzIxfQ.3mBbhiliFRRh5EszVAlebV5lZ5XAqCyNvPCz4bG-stZHD0jHpJhqEiS6XD9MhHkC0zBlbWYPhcfZoZzoZbBrKA",
        "content-type": "application/json",
        "language": "en",
        "sec-ch-ua": "\"Not;A=Brand\";v=\"99\", \"Brave\";v=\"139\", \"Chromium\";v=\"139\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"macOS\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "sec-gpc": "1",
        "cookie": "BIGipServerTAXPORTAL_WEB_POOL=!Xz38osPzCCquaiTc6MoEqcDKEMxFL45nb2HfOE09GNFqiFSA2Q2AqYxuUUM3wwvGyBjQtNUfLsziM50=",
        "Referer": "https://taxinformation.cbic.gov.in/"
    },
    "body": "{\"keyword\":\" \",\"taxId\":\"1000001\",\"actId\":null,\"content\":null,\"startIndex\":0,\"paginationFlag\":true,\"rows\":10}",
    "method": "POST"
}).then(response => response.json()).then(data => console.log(data));