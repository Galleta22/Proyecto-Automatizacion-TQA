export default function Spinner() {
  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      margin: "2em"
    }}>
      <div className="lds-ring">
        <div /><div /><div /><div />
      </div>
    </div>
  );
}
