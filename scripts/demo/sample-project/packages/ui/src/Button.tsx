export function Button(props: { onClick?: () => void; children: React.ReactNode }) {
  return <button className="feria-button" onClick={props.onClick}>{props.children}</button>;
}
