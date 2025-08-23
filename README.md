# ProST

ProST is a web application that allows users to analyze short-term simulations by interacting with the process execution and its performance statistics.
The interface depicts a token-based animation of the process execution, and allows for the analysis of different performance metrics associated to activities or flows.

## 🧠 Demo – Setup Instructions

This project contains the **frontend interface** for the Business Process Simulation platform.  
To run the full system (including simulation engine and database), you must also install and configure the **backend**.

---

### ⚙️ Prerequisites

- [Node.js](https://nodejs.org/) (v16+)
- [Python 3.11](https://www.python.org/downloads/release/python-3110/)
- [MySQL Server](https://dev.mysql.com/downloads/mysql/)
- Git

---

## 🚀 Frontend Setup

```bash
git clone https://github.com/AutomatedProcessImprovement/prost.git
cd prost
cp .env.example .env
npm install
npm run dev
```

This runs the frontend at [http://localhost:3000](http://localhost:3000).

---

## 🖥️ Backend Setup

The backend repo is located here:  
🔗 [https://github.com/AutomatedProcessImprovement/ongoing-bps-state.git](https://github.com/AutomatedProcessImprovement/ongoing-bps-state.git)

### 1. Clone and Set Up Python Environment

```bash
git clone https://github.com/AutomatedProcessImprovement/ongoing-bps-state.git
cd ongoing-bps-state
python3.11 -m venv .venv
source .venv/bin/activate       # On Windows use: .venv\Scripts\activate
pip install --upgrade pip
pip install fastapi uvicorn mysql-connector-python pix-framework ongoing-process-state python-dotenv python-multipart
pip install git+https://github.com/AutomatedProcessImprovement/Prosimos@short-term-simulation
```


---

### 2. MySQL Database Setup

Ensure MySQL and Redis are running:

---

### 3. Configure Environment Variables

Create a `.env` file inside the `ongoing-bps-state` folder:

```env
DB_USER=root
DB_PASSWORD=yourpassword
DB_HOST=localhost
DB_PORT=3306
DB_NAME=prost_simulator
```

Adjust values to match your local MySQL setup. This also applies to the frontend setup.

---

### 4. Run the Backend Server (Development Mode)

```bash
uvicorn main_web_app:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at [http://localhost:8000](http://localhost:8000).

---

### 🧪 Test the Full Stack

Once both frontend and backend are running:

- Access the frontend UI at [http://localhost:3000](http://localhost:3000)
- Upload your BPMN and JSON configuration files
- Ensure backend requests (e.g., `/api/simulation`) are working correctly

